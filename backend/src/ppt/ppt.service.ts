import { Injectable } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import PptxGenJS from 'pptxgenjs';
import axios from 'axios';
import { exec } from 'child_process';

@Injectable()
export class PptService {

  cleanText(text: string) {
    if (!text) return "";
    return text.replace(/[^\x00-\x7F]/g, '').replace(/\s+/g, ' ').trim();
  }

  // ================= IMAGE RULE =================
  shouldShowImage(heading: string): boolean {
    const h = heading.toLowerCase();
    return h.includes("core concept") || h.includes("application");
  }

  // ================= DIAGRAM RULE =================
  shouldShowDiagram(heading: string): boolean {
    return heading.toLowerCase().includes("working");
  }

  // ================= IMAGE QUERY =================
  buildImageQuery(topic: string, heading: string) {
    const h = heading.toLowerCase();

    if (h.includes("core concept")) {
      return `${topic} conceptual diagram labeled`;
    }

    if (h.includes("application")) {
      return `${topic} industry use case illustration diagram`;
    }

    return `${topic} technical diagram`;
  }

  // ================= IMAGE FETCH =================
  async fetchImage(query: string) {
    try {
      const res = await axios.get("https://api.unsplash.com/search/photos", {
        params: { query, per_page: 1 },
        headers: {
          Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`
        }
      });

      return res.data.results[0]?.urls?.regular || null;
    } catch {
      return null;
    }
  }

  async downloadImage(url: string, name: string) {
    const file = path.join(__dirname, `../../${name}.jpg`);
    const res = await axios.get(url, { responseType: 'arraybuffer' });
    fs.writeFileSync(file, res.data);
    return file;
  }

  // ================= MERMAID =================
  isValidMermaid(code: string): boolean {
    if (!code) return false;
    return code.trim().startsWith("graph TD");
  }

  async generateDiagram(code: string, file: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const input = path.join(__dirname, `../../${file}.mmd`);
      const output = path.join(__dirname, `../../${file}.png`);

      fs.writeFileSync(input, code);

      exec(`npx mmdc -i ${input} -o ${output}`, (err) => {
        if (err) reject(err);
        else resolve(output);
      });
    });
  }

  // ================= MAIN =================
  async createPPT(data: any, totalSlides: number): Promise<string> {

    const pptx = new PptxGenJS();
    pptx.layout = 'LAYOUT_16x9';

    let slideCount = 0;

    // ===== TITLE =====
    const titleSlide = pptx.addSlide();
    slideCount++;

    titleSlide.addText(this.cleanText(data.title), {
      x: 1, y: 2, w: 8,
      fontSize: 36,
      bold: true,
      align: "center"
    });

   let slides = data.slides || [];

// 🔥 LIMIT SLIDES STRICTLY
// totalSlides includes title also
const maxContentSlides = totalSlides - 1;

// If AI gives more slides → trim
if (slides.length > maxContentSlides) {
  slides = slides.slice(0, maxContentSlides);
}

// If AI gives less → no issue

// ===== LOOP =====
for (let idx = 0; idx < slides.length; idx++) {

  // 🚫 STOP if exceeding limit
  if (slideCount >= totalSlides) break;

  const slideData = slides[idx];
  if (!slideData || !slideData.heading) continue;

  const heading = this.cleanText(slideData.heading);

  // 🔥 FORCE last slide as conclusion
  const isLastSlide = slideCount === totalSlides - 1;

  const finalHeading = isLastSlide ? "Conclusion" : heading;

  const rawPoints = (slideData.points || []).map(p => this.cleanText(p));

  const isAlgorithm = finalHeading.toLowerCase().includes("algorithm");

  let visualRendered = false;
  let imagePath: string | null = null;

  try {
    if (
      !isAlgorithm &&
      slideData.diagramCode &&
      this.shouldShowDiagram(finalHeading) &&
      this.isValidMermaid(slideData.diagramCode)
    ) {
      imagePath = await this.generateDiagram(
        slideData.diagramCode,
        `diag-${Date.now()}`
      );
      visualRendered = true;
    }
    else if (!isAlgorithm && this.shouldShowImage(finalHeading)) {

      const query = this.buildImageQuery(data.title, finalHeading);
      const url = await this.fetchImage(query);

      if (url) {
        imagePath = await this.downloadImage(url, `img-${Date.now()}`);
        visualRendered = true;
      }
    }

  } catch {
    visualRendered = false;
  }

  let points = rawPoints
    .filter(p => p && p.length > 10)
    .slice(0, visualRendered ? 3 : 5);

  const slide = pptx.addSlide();
  slideCount++;

  slide.addText(finalHeading, {
    x: 0.5,
    y: 0.3,
    fontSize: 28,
    bold: true
  });

  slide.addText(
    points.map(p => ({
      text: p,
      options: { bullet: true }
    })),
    {
      x: 0.7,
      y: 2.0,
      w: visualRendered ? 4.5 : 8.5,
      fontSize: visualRendered ? 18 : 20
    }
  );

  if (visualRendered && imagePath) {
    slide.addImage({
      path: imagePath,
      x: 5.5,
      y: 2,
      w: 4,
      h: 3
    });
  }
}
    const fileName = `ppt-${Date.now()}.pptx`;
    const filePath = path.join(__dirname, '../../', fileName);

    await pptx.writeFile({ fileName: filePath });

    return filePath;
  }
}