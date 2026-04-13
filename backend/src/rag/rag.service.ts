import {
  Injectable,
  BadRequestException,
} from "@nestjs/common";
import axios from "axios";
import { PrismaService } from "../prisma/prisma.service";
import { ChatService } from "../chat/chat.service";

@Injectable()
export class RagService {
  constructor(
    private prisma: PrismaService,
    private chatService: ChatService
  ) {}

  //////////////////////////////////////////////////////
  // EMBEDDING
  //////////////////////////////////////////////////////
  async getEmbedding(text: string): Promise<number[]> {
    try {
      if (!text || text.trim().length < 3) return [];

      const res = await axios.post("http://localhost:11434/api/embeddings", {
        model: "nomic-embed-text",
        prompt: text,
      });

      return res.data?.embedding || [];
    } catch (err: any) {
      console.error("Embedding error:", err.message);
      return [];
    }
  }

  //////////////////////////////////////////////////////
  // SAFE JSON PARSER
  //////////////////////////////////////////////////////
  safeParseEval(content: string) {
    try {
      if (!content) return null;
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return null;
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  //////////////////////////////////////////////////////
  // EVALUATION (70B)
  //////////////////////////////////////////////////////
  async evaluateAnswer(question: string, answer: string) {
    const prompt = `
Evaluate the answer.

Return ONLY JSON:
{
  "score": number,
  "feedback": ""
}

Question:
${question}

Answer:
${answer}
`;

    try {
      const res = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          model: "meta-llama/llama-3-70b-instruct",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.2,
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          },
        }
      );

      const raw = res.data?.choices?.[0]?.message?.content;
      const parsed = this.safeParseEval(raw);

      return parsed || { score: 0, feedback: "Evaluation failed" };
    } catch {
      return { score: 0, feedback: "Evaluation error" };
    }
  }

  //////////////////////////////////////////////////////
  // MAIN FUNCTION
  //////////////////////////////////////////////////////
  async askQuestion(
    question: string,
    versionId: number | null,
    chatSessionId: number | null,
    userId: number
  ) {
    const startTime = Date.now();

    try {
      //////////////////////////////////////////////////////
      // VALIDATION
      //////////////////////////////////////////////////////
      if (!question || question.trim().length < 3) {
        throw new BadRequestException("Invalid question");
      }

      //////////////////////////////////////////////////////
      // CREATE CHAT
      //////////////////////////////////////////////////////
      if (!chatSessionId) {
        const newChat = await this.chatService.createSession(userId, null, null);
        chatSessionId = newChat.id;
      }

      //////////////////////////////////////////////////////
      // SAVE USER MESSAGE
      //////////////////////////////////////////////////////
      await this.chatService.saveMessage(chatSessionId, "user", question);

      //////////////////////////////////////////////////////
      // HYBRID RETRIEVAL
      //////////////////////////////////////////////////////
      let context = "";

      if (versionId) {
        const safeQ = question.toLowerCase().replace(/'/g, "''");

        // KEYWORD SEARCH
        const keywordResults = await this.prisma.$queryRawUnsafe(`
          SELECT content
          FROM "Chunk"
          WHERE "versionId" = ${versionId}
          AND LOWER(content) LIKE '%${safeQ}%'
          LIMIT 5;
        `) as { content: string }[];

        if (keywordResults && keywordResults.length > 0) {
          context = keywordResults
            .map((r) => r.content)
            .join("\n\n")
            .slice(0, 6000);
        } else {
          // SEMANTIC SEARCH
          const embedding = await this.getEmbedding(question);

          if (embedding.length) {
            const vector = `[${embedding.join(",")}]`;

            const results = await this.prisma.$queryRawUnsafe(`
              SELECT content, (embedding <-> '${vector}'::vector) AS distance
              FROM "Chunk"
              WHERE "versionId" = ${versionId}
              ORDER BY distance ASC
              LIMIT 5;
            `) as { content: string; distance: number }[];

            if (results && results.length > 0 && results[0].distance < 2.0) {
              context = results
                .filter(r => r.distance < 2.0)
                .map(r => r.content)
                .join("\n\n")
                .slice(0, 6000);
            }
          }
        }
      }

      //////////////////////////////////////////////////////
      // FALLBACK IF NO CONTEXT
 // 🚨 ONLY restrict when document mode is active
if (versionId && (!context || context.trim().length < 20)) {
  return {
    answer: "This question is not sufficiently covered in the document.",
    chatSessionId,
    evaluation: { score: 0, feedback: "No context found" },
    meta: {
      executionTime: Date.now() - startTime,
      isDuplicate: false,
      fallback: true,
    },
  };
}
//////////////////////////////////////////////////////
// 📘 NORMAL CHAT MODE (NO DOCUMENT)
//////////////////////////////////////////////////////
if (!versionId) {
  const prompt = `
You are an expert tutor for ${question}.

Explain clearly with:
- Definition
- Working
- Real-world relevance
- Example
- Summary
`;

  const res = await axios.post(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      model: "meta-llama/llama-3-8b-instruct",
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
    }
  );

  const answer = res.data?.choices?.[0]?.message?.content || "No response";

  await this.chatService.saveMessage(chatSessionId, "assistant", answer);

  return {
    answer,
    chatSessionId,
    evaluation: { score: 0, feedback: "Normal chat mode" },
    meta: {
      executionTime: Date.now() - startTime,
      isDuplicate: false,
    },
  };
}

      //////////////////////////////////////////////////////
      // PROMPT
      //////////////////////////////////////////////////////
const prompt = `
You are an expert AI Tutor teaching a university-level course.

MODE: DOCUMENT MODE (STRICT)

Topic: ${question}

${context ? `Context:\n${context}` : ""}

========================================
🚨 STRICT RULES (MUST FOLLOW)
========================================

- Answer MUST be based ONLY on the provided context
- DO NOT use outside knowledge
- If context is insufficient → say:
  "⚠️ This question is not fully covered in the document."

========================================
🎯 EXPLANATION STYLE (VERY IMPORTANT)
========================================

You must explain like a PROFESSOR:

- Use clear, structured, and academic language
- Explain BOTH:
  ✔ WHAT the concept is  
  ✔ HOW it works internally  
  ✔ WHY it is important  
- Include system-level reasoning (not surface-level)
- Use cause → effect explanations
- Maintain logical flow across sections

========================================
🧠 DEPTH REQUIREMENTS
========================================

- Avoid generic explanations
- Each section must provide meaningful insight
- Include:
  ✔ internal working
  ✔ process flow
  ✔ real-world relevance
- Use technical terminology where appropriate

========================================
📊 STRUCTURE (STRICT FORMAT)
========================================

# ${question}

## 1. Introduction
- Brief overview of the topic
- Context and importance

## 2. Key Concepts
- Define core ideas clearly
- Explain components involved

## 3. Detailed Explanation
- Step-by-step working mechanism
- Internal process flow
- System-level explanation

## 4. Examples
- Provide practical or real-world examples
- Relate to applications or systems

## 5. Important Points
- Key takeaways
- Critical insights

## 6. Summary
- Concise recap of the topic
- Reinforce main understanding

========================================
🚫 STRICTLY AVOID
========================================

- Generic statements like:
  "This is important"
  "Widely used"
- Repetition
- Shallow explanations
- Content not present in context

========================================
🎯 OUTPUT FORMAT
========================================

- Use clear headings
- Use bullet points where needed
- Keep explanation readable but detailed
- Maintain professional tone
`;

      //////////////////////////////////////////////////////
      // PRIMARY MODEL
      //////////////////////////////////////////////////////
      let answer = "";

      try {
        const res = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: "meta-llama/llama-3-8b-instruct",
            messages: [{ role: "user", content: prompt }],
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            },
          }
        );

        answer = res.data?.choices?.[0]?.message?.content || "";
      } catch {
        console.log("Primary model failed, switching to fallback");
      }

      //////////////////////////////////////////////////////
      // FALLBACK MODEL
      //////////////////////////////////////////////////////
      if (!answer || answer.length < 50) {
        const fallbackRes = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: "mistralai/mistral-7b-instruct",
            messages: [{ role: "user", content: prompt }],
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            },
          }
        );

        answer =
          fallbackRes.data?.choices?.[0]?.message?.content ||
          "Failed to generate answer";
      }

      //////////////////////////////////////////////////////
      // DUPLICATE CHECK
      //////////////////////////////////////////////////////
      const lastMessages = await this.prisma.message.findMany({
        where: { chatSessionId },
        orderBy: { createdAt: "desc" },
        take: 3,
      });

      const isDuplicate = lastMessages.some(
        (m) =>
          m.role === "assistant" &&
          m.content?.slice(0, 100) === answer.slice(0, 100)
      );

      //////////////////////////////////////////////////////
      // EVALUATION
      //////////////////////////////////////////////////////
      const evaluation = await this.evaluateAnswer(question, answer);

      //////////////////////////////////////////////////////
      // TIME
      //////////////////////////////////////////////////////
      const executionTime = Date.now() - startTime;

      //////////////////////////////////////////////////////
      // SAVE RESPONSE
      //////////////////////////////////////////////////////
      await this.chatService.saveMessage(chatSessionId, "assistant", answer);

      //////////////////////////////////////////////////////
      // LOGS
      //////////////////////////////////////////////////////
      console.log("AI Analytics");
      console.log("Question:", question);
      console.log("Time:", executionTime);
      console.log("Score:", evaluation.score);
      console.log("Duplicate:", isDuplicate);

      //////////////////////////////////////////////////////
      // RETURN
      //////////////////////////////////////////////////////
      return {
        answer,
        chatSessionId,
        evaluation,
        meta: {
          executionTime,
          isDuplicate,
        },
      };

    } catch (err: any) {
      console.error("RAG Error:", err.message);
      throw new BadRequestException("Failed to generate answer");
    }
  }
}