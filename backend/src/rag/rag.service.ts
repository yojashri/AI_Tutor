import {
  Injectable,
  BadRequestException,
  HttpException,
  HttpStatus,
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
  // 🔥 EMBEDDING
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
      console.error("❌ Embedding error:", err.message);
      return [];
    }
  }

  //////////////////////////////////////////////////////
  // 🚀 MAIN ASK FUNCTION (UPDATED 🔥)
  //////////////////////////////////////////////////////
  async askQuestion(
  question: string,
  versionId: number | null,
  chatSessionId: number | null,
  userId: number,
  course?: string
) {
  try {
    //////////////////////////////////////////////////////
    // ✅ VALIDATION
    //////////////////////////////////////////////////////
    if (!question?.trim()) {
      throw new BadRequestException("Enter a valid question");
    }

    if (!userId) {
      throw new BadRequestException("User required");
    }

    if (question.trim().length < 3) {
      throw new BadRequestException("Invalid topic");
    }

    if (!/[a-zA-Z]{3,}/.test(question)) {
      throw new BadRequestException("Enter meaningful topic");
    }

    //////////////////////////////////////////////////////
    // 🆕 CREATE CHAT
    //////////////////////////////////////////////////////
    if (!chatSessionId) {
      const newChat = await this.chatService.createSession(userId, null, null);
      chatSessionId = newChat.id;
    }

    //////////////////////////////////////////////////////
    // 💾 SAVE USER MESSAGE
    //////////////////////////////////////////////////////
    await this.chatService.saveMessage(chatSessionId, "user", question);

    //////////////////////////////////////////////////////
    // 🧠 CONTEXT (HYBRID RETRIEVAL 🔥)
    //////////////////////////////////////////////////////
    let context = "";

    if (versionId) {
      const safeQ = question.toLowerCase().replace(/'/g, "''");

      //////////////////////////////////////////////////////
      // 🔥 1. KEYWORD SEARCH (FAST + EXACT)
      //////////////////////////////////////////////////////
      const keywordResults = await this.prisma.$queryRawUnsafe(`
        SELECT content
        FROM "Chunk"
        WHERE "versionId" = ${versionId}
        AND LOWER(content) LIKE '%${safeQ}%'
        LIMIT 5;
      `) as { content: string }[];

      if (keywordResults.length > 0) {
        console.log("✅ Keyword match used");

        context = keywordResults
          .map(r => r.content)
          .join("\n\n")
          .slice(0, 6000);
      }

      //////////////////////////////////////////////////////
      // 🔥 2. EMBEDDING SEARCH (FALLBACK)
      //////////////////////////////////////////////////////
      else {
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

          if (!results || results.length === 0) {
            return {
              answer:
                "⚠️ Please ask a question related to the uploaded document 📄",
              chatSessionId,
            };
          }

          const bestMatch = results[0];

          //////////////////////////////////////////////////////
          // 🔥 RELEVANCE CHECK
          //////////////////////////////////////////////////////
          if (bestMatch.distance > 2.0) {
            return {
              answer:
                "⚠️ This question is not related to your document. Try asking something from the uploaded file 📄",
              chatSessionId,
            };
          }

          context = results
            .filter(r => r.distance < 2.0)
            .map(r => r.content)
            .join("\n\n")
            .slice(0, 6000);
        }
      }
    }

    //////////////////////////////////////////////////////
    // 🔥 PROMPT
    //////////////////////////////////////////////////////
    const prompt = `
You are an AI Tutor.

MODE: DOCUMENT MODE

Topic: ${question}

${context ? `Context:\n${context}` : ""}

RULE:
- ONLY answer from context
- If context is empty, say not related

FORMAT:

# ${question}

## 1. Introduction
## 2. Key Concepts
## 3. Detailed Explanation
## 4. Examples
## 5. Important Points
## 6. Summary
`;

    //////////////////////////////////////////////////////
    // 🤖 MODEL
    //////////////////////////////////////////////////////
    const response = await axios.post(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        model: "meta-llama/llama-3-8b-instruct",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
      }
    );

    const answer =
      response.data?.choices?.[0]?.message?.content ||
      "Failed to generate";

    //////////////////////////////////////////////////////
    // 💾 SAVE AI MESSAGE
    //////////////////////////////////////////////////////
    await this.chatService.saveMessage(chatSessionId, "assistant", answer);

    //////////////////////////////////////////////////////
    // ✅ RETURN
    //////////////////////////////////////////////////////
    return {
      answer,
      chatSessionId,
    };
  } catch (error: any) {
    console.error("❌ RAG ERROR:", error.message);
    throw new BadRequestException("Failed to generate answer");
  }
}
}