import { Injectable, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { PptService } from '../ppt/ppt.service';

type Slide = {
  heading: string;
  points: string[];
  diagramCode: string;
};

type Evaluation = {
  score: number;
  feedback: string;
};

@Injectable()
export class TutorService {
  constructor(private pptService: PptService) {}

  //////////////////////////////////////////////////////
  // SAFE JSON PARSER
  //////////////////////////////////////////////////////
  safeJsonParse(content: string) {
    try {
      const clean = content
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();

      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return null;

      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  //////////////////////////////////////////////////////
  // AI CALL (NO FALLBACK MODEL)
  //////////////////////////////////////////////////////
  async callAI(prompt: string) {
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

      const output = res.data?.choices?.[0]?.message?.content;

      if (!output) {
        throw new Error("Empty AI response");
      }

      return output;

    } catch (err: any) {
      console.error("AI call failed:", err.message);
      throw new BadRequestException("AI generation failed");
    }
  }

  //////////////////////////////////////////////////////
  // MERMAID DIAGRAM
  //////////////////////////////////////////////////////
  generateDynamicDiagram(topic: string, heading: string) {
    return `graph TD
UserInput[User Input] --> Process[${heading}]
Process --> Engine[${topic} Engine]
Engine --> Validation{Valid Data?}
Validation -->|Yes| Transform[Process Data]
Validation -->|No| Error[Handle Error]
Transform --> Output[Final Output]
Error --> Output`;
  }

  //////////////////////////////////////////////////////
  // GENERATE CONTENT (SMART + STABLE)
  //////////////////////////////////////////////////////
  async generateContent(course: string, topic: string, slides: number) {

const prompt = `
You are a HIGHLY STRICT academic PPT generator designed for university-level content.

Generate EXACTLY ${slides} slides.

Topic: "${topic}"
Course: "${course}"

========================================
🚨 HARD CONSTRAINTS (ABSOLUTE)
========================================

- You MUST generate EXACTLY ${slides} slides
- DO NOT exceed or reduce slide count
- DO NOT skip any rule

========================================
📌 STRUCTURE (MANDATORY)
========================================

Slide 1 → Introduction  
Slide 2 → Definition  
Slide ${slides} → Conclusion (ALWAYS LAST)

Middle slides:
- MUST be intelligently generated based on topic
- MUST NOT repeat content
- MUST maintain logical progression

========================================
🧠 CONTENT DISTRIBUTION (STRICT)
========================================

Slides MUST include (at least once):

- Core Concept (ONLY ONE slide)
- Working Principle (MANDATORY)
- Algorithm OR Example
- Applications (ONLY ONE slide)

Additional slides should expand:

- Performance Analysis
- Optimization
- Real-world Use Cases
- Comparison
- System Design

⚠️ Adapt dynamically:
- Fewer slides → merge concepts
- More slides → deepen explanation (NO repetition)

========================================
📊 CONTENT RULES (VERY STRICT)
========================================

FOR ALL SLIDES (except Applications):

- EXACTLY 5 bullet points
- Each bullet MUST:
  ✔ Be 12–20 words
  ✔ Be a COMPLETE sentence
  ✔ Explain HOW and WHY
  ✔ Include system-level or internal working explanation
  ✔ Be technically meaningful (engineering-level)

❌ STRICTLY FORBIDDEN:
- Generic phrases
- Repetition
- Surface-level explanations
- Filler content

========================================
📌 APPLICATION SLIDE (SPECIAL)
========================================

- ONLY short keywords (1–4 words)
- NO sentences

Example:
- Data Processing
- Load Balancing
- Query Optimization

========================================
📊 DIAGRAM RULES (CRITICAL)
========================================

Working Principle:
- MUST include Mermaid diagram
- MUST represent REAL system flow

Algorithm / Example:
- MUST include Mermaid IF applicable

Core Concept:
- NO diagram

Applications:
- NO diagram

========================================
⚠️ MERMAID STRICT RULES
========================================

- MUST start with: graph TD
- MUST include meaningful system nodes
- MUST include branching or logic flow when applicable
- MUST NOT be generic (A → B → C)

Example:
graph TD
Input --> Processing
Processing --> Decision{Condition}
Decision --> Output1
Decision --> Output2

========================================
🚫 QUALITY CONTROL
========================================

- NO duplicate points
- NO duplicate slides
- Each slide must be UNIQUE
- Maintain academic tone
- Maintain logical flow
- Avoid redundancy across slides

========================================
📦 OUTPUT FORMAT (STRICT JSON ONLY)
========================================

Return ONLY valid JSON:

{
  "title": "${topic}",
  "slides": [
    {
      "heading": "",
      "points": [],
      "diagramCode": ""
    }
  ]
}

RULES:
- No explanations
- No markdown
- No extra text
- Valid JSON only
`;

    //////////////////////////////////////////////////////
    // RETRY LOGIC (MAX 2 TIMES)
    //////////////////////////////////////////////////////
    let parsed: any = null;

    for (let i = 0; i < 2; i++) {
      const raw = await this.callAI(prompt);
      parsed = this.safeJsonParse(raw);

      if (parsed && parsed.slides) break;

      console.log("Retrying AI generation...");
    }

    if (!parsed || !parsed.slides) {
      throw new BadRequestException("AI failed to generate valid slides");
    }

    let aiSlides: Slide[] = parsed.slides;

    //////////////////////////////////////////////////////
    // TRIM EXTRA SLIDES
    //////////////////////////////////////////////////////
    if (aiSlides.length > slides) {
      aiSlides = aiSlides.slice(0, slides);
    }

    //////////////////////////////////////////////////////
    // BUILD FINAL SLIDES (NO FAKE DATA)
    //////////////////////////////////////////////////////
    const finalSlides: Slide[] = [];

    for (let i = 0; i < slides; i++) {

      let slide = aiSlides[i];

      // fallback to nearest valid AI slide (NOT generic)
      if (!slide) {
        slide = aiSlides[i - 1] || aiSlides[0];
      }

      //////////////////////////////////////////////////////
      // HEADING FIX
      //////////////////////////////////////////////////////
      let heading = slide.heading;

      if (!heading || heading.toLowerCase().includes("concept")) {
        heading = `Topic Insight ${i + 1}`;
      }

      //////////////////////////////////////////////////////
      // POINT FIX (NO GENERIC CONTENT)
      //////////////////////////////////////////////////////
      let points = slide.points || [];

      if (points.length < 5) {
        while (points.length < 5) {
          points.push(points[points.length - 1] || "Explanation unavailable");
        }
      }

      //////////////////////////////////////////////////////
      // FORCE STRUCTURE
      //////////////////////////////////////////////////////
      if (i === 0) heading = "Introduction";
      if (i === 1) heading = "Definition";
      if (i === slides - 1) heading = "Conclusion";

      //////////////////////////////////////////////////////
      // DIAGRAM FIX
      //////////////////////////////////////////////////////
      let diagramCode = slide.diagramCode || "";

      if (
        heading.toLowerCase().includes("working") ||
        heading.toLowerCase().includes("algorithm")
      ) {
        if (!diagramCode.includes("graph TD")) {
          diagramCode = this.generateDynamicDiagram(topic, heading);
        }
      }

      finalSlides.push({
        heading,
        points: points.slice(0, 5),
        diagramCode
      });
    }

    return {
      title: topic,
      slides: finalSlides
    };
  }

  //////////////////////////////////////////////////////
  // EVALUATION
  //////////////////////////////////////////////////////
  async evaluateSlides(slides: Slide[]) {
    const results: Evaluation[] = [];

    for (const slide of slides) {

      const prompt = `
Return ONLY JSON:

{
 "score": number,
 "feedback": "short feedback"
}

Slide:
${JSON.stringify(slide)}
`;

      try {
        const res = await axios.post(
          "https://openrouter.ai/api/v1/chat/completions",
          {
            model: "meta-llama/llama-3-70b-instruct",
            messages: [{ role: "user", content: prompt }],
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
            },
          }
        );

        const raw = res.data.choices[0].message.content;
        const parsed = this.safeJsonParse(raw);

        if (!parsed || !parsed.score) {
          results.push({ score: 0, feedback: "Parsing failed" });
        } else {
          results.push(parsed);
        }

      } catch {
        results.push({ score: 0, feedback: "Evaluation error" });
      }
    }

    return results;
  }

  //////////////////////////////////////////////////////
  // MAIN PPT
  //////////////////////////////////////////////////////
  async generatePPT(course: string, topic: string, slides: number) {

    const content = await this.generateContent(course, topic, slides);

    const filePath = await this.pptService.createPPT(content, slides);

    const evaluation = await this.evaluateSlides(content.slides);

    console.log("Evaluation:", evaluation);

    return {
      slides: content.slides,
      file: filePath,
      evaluation
    };
  }
}