import { Injectable, BadRequestException } from '@nestjs/common';
import mammoth from 'mammoth';
import { PrismaService } from '../prisma/prisma.service';
import { RagService } from '../rag/rag.service';
import * as crypto from 'crypto';
import type { Express } from 'express';
import Tesseract from "tesseract.js";
import * as fs from "fs";
import * as path from "path";
import * as poppler from "pdf-poppler";
import { parseOffice } from "officeparser";

const pdfParse = (...args: any[]) => require('pdf-parse')(...args);

//////////////////////////////////////////////////////
// 🔥 OCR FUNCTION (FAST + FULL SUPPORT)
//////////////////////////////////////////////////////

async function runOCR(
  buffer: Buffer,
  maxPages: number | null = 3
): Promise<string> {

  const tempDir = path.join(process.cwd(), "uploads/temp");

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const timestamp = Date.now();

  const pdfPath = path.join(tempDir, `temp_${timestamp}.pdf`);
  fs.writeFileSync(pdfPath, buffer);

  const options = {
    format: "png",
    out_dir: tempDir,
    out_prefix: `output_${timestamp}`,
    page: maxPages, // null = all pages
  };

  await poppler.convert(pdfPath, options);

  const files = fs.readdirSync(tempDir)
    .filter(f => f.startsWith(`output_${timestamp}`) && f.endsWith(".png"));

  let text = "";

  for (const file of files) {
    const filePath = path.join(tempDir, file);

    try {
      const result = await Tesseract.recognize(filePath, "eng");
      text += result.data.text + "\n";
    } catch (err) {
      console.error("OCR failed:", err);
    }

    // delete image
    fs.unlinkSync(filePath);
  }

  // delete temp PDF
  fs.unlinkSync(pdfPath);

  return text;
}

//////////////////////////////////////////////////////
// 🔥 BACKGROUND OCR
//////////////////////////////////////////////////////

async function processFullDocumentInBackground(
  buffer: Buffer,
  versionId: number,
  storeChunks: (text: string, versionId: number) => Promise<void>
) {
  try {
    console.log("🔥 Background OCR started...");

    const fullText = await runOCR(buffer, null); // all pages

    await storeChunks(fullText, versionId);

    console.log("✅ Background OCR completed");

  } catch (err) {
    console.error("❌ Background OCR failed:", err);
  }
}

//////////////////////////////////////////////////////
// 📦 RESPONSE TYPE
//////////////////////////////////////////////////////

type ProcessFileResult = {
  message: string;
  documentId: number;
  versionId: number;
  chatSessionId: number | null;
  reused: boolean;
  updated: boolean;
  replaced: boolean;
};

//////////////////////////////////////////////////////
// 🚀 SERVICE
//////////////////////////////////////////////////////

@Injectable()
export class DocumentService {
  constructor(
    private prisma: PrismaService,
    private ragService: RagService
  ) {}

  //////////////////////////////////////////////////////
  // 🚀 MAIN FUNCTION
  //////////////////////////////////////////////////////
  async processFile(
    file: Express.Multer.File,
    userId: number,
    replace = false
  ): Promise<ProcessFileResult> {

    if (!file) throw new BadRequestException('No file uploaded');

    const allowedTypes = [
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
       "application/vnd.openxmlformats-officedocument.presentationml.presentation", // pptx
  "application/vnd.ms-powerpoint", // ppt
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException("Only PDF, DOCX, TXT allowed");
    }

    //////////////////////////////////////////////////////
    // 🔥 HASH
    //////////////////////////////////////////////////////
    const hash = crypto
      .createHash('sha256')
      .update(file.buffer)
      .digest('hex');

    //////////////////////////////////////////////////////
    // 🧠 DUPLICATE CHECK
    //////////////////////////////////////////////////////
    const existingVersion = await this.prisma.documentVersion.findFirst({
      where: {
        hash,
        document: { userId },
      },
      include: {
        document: {
          include: {
            chats: {
              orderBy: { createdAt: "desc" },
              take: 1,
            },
          },
        },
      },
    });

    if (existingVersion && !replace) {
      const existingChat = existingVersion.document.chats[0];

      return {
        message: '⚠️ File already exists',
        documentId: existingVersion.documentId,
        versionId: existingVersion.id,
        chatSessionId: existingChat?.id || null,
        reused: true,
        updated: false,
        replaced: false,
      };
    }

    //////////////////////////////////////////////////////
    // 🔁 REPLACE
    //////////////////////////////////////////////////////
    if (existingVersion && replace) {
      const docId = existingVersion.documentId;

      await this.prisma.chunk.deleteMany({
        where: { version: { documentId: docId } },
      });

      await this.prisma.documentVersion.deleteMany({
        where: { documentId: docId },
      });
    }

    //////////////////////////////////////////////////////
    // 📄 PARSE FILE
    //////////////////////////////////////////////////////
    const text = await this.parseFile(file);

    //////////////////////////////////////////////////////
    // 🔍 FIND DOCUMENT
    //////////////////////////////////////////////////////
    let document: any = await this.prisma.document.findFirst({
      where: { userId, name: file.originalname },
      include: {
        versions: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    //////////////////////////////////////////////////////
    // 🆕 CREATE DOCUMENT
    //////////////////////////////////////////////////////
    if (!document) {
      document = await this.prisma.document.create({
        data: {
          name: file.originalname,
          fileType: file.mimetype,
          fileSize: file.size,
          userId,
        },
      }) as any;

      const version = await this.prisma.documentVersion.create({
        data: {
          documentId: document.id,
          versionNumber: 1,
          hash,
        },
      });

      await this.storeChunks(text, version.id);

      // 🔥 background processing
      setTimeout(() => {
        processFullDocumentInBackground(
          file.buffer,
          version.id,
          this.storeChunks.bind(this)
        );
      }, 0);

      const chat = await this.prisma.chatSession.create({
        data: {
          documentId: document.id,
          versionId: version.id,
          userId,
        },
      });

      return {
        message: '✅ Document uploaded',
        documentId: document.id,
        versionId: version.id,
        chatSessionId: chat.id,
        reused: false,
        updated: false,
        replaced: false,
      };
    }

    //////////////////////////////////////////////////////
    // 🔄 NEW VERSION
    //////////////////////////////////////////////////////
    const oldVersion = document.versions?.[0];

    const version = await this.prisma.documentVersion.create({
      data: {
        documentId: document.id,
        versionNumber: (oldVersion?.versionNumber || 0) + 1,
        hash,
      },
    });

    await this.storeChunks(text, version.id);

    // 🔥 background processing
    setTimeout(() => {
      processFullDocumentInBackground(
        file.buffer,
        version.id,
        this.storeChunks.bind(this)
      );
    }, 0);

    const chat = await this.prisma.chatSession.create({
      data: {
        documentId: document.id,
        versionId: version.id,
        userId,
      },
    });

    return {
      message: '🟡 Document updated',
      documentId: document.id,
      versionId: version.id,
      chatSessionId: chat.id,
      reused: false,
      updated: true,
      replaced: false,
    };
  }

  //////////////////////////////////////////////////////
  // 📄 PARSER
  //////////////////////////////////////////////////////
  async parseFile(file: Express.Multer.File): Promise<string> {

    if (file.mimetype === "application/pdf") {
      const data = await pdfParse(file.buffer);
      let text = data.text;

      if (!text || text.replace(/\s/g, "").length < 50) {
        console.log("📸 Scanned PDF → OCR (FAST)");

        const ocrText = await runOCR(file.buffer, 3);

        text = (text || "") + "\n" + ocrText;
      }

      return text;
    }

    if (file.mimetype.includes("word")) {
      const result = await mammoth.extractRawText({
        buffer: file.buffer,
      });
      return result.value;
    }

    if (file.mimetype === "text/plain") {
      return file.buffer.toString("utf-8");
    }

    //////////////////////////////////////////////////////
// 📊 PPT / PPTX
//////////////////////////////////////////////////////
//////////////////////////////////////////////////////
// 📊 PPT / PPTX
//////////////////////////////////////////////////////
//////////////////////////////////////////////////////
// 📊 PPT / PPTX
//////////////////////////////////////////////////////
if (
  file.mimetype.includes("presentation") ||
  file.originalname.endsWith(".pptx") ||
  file.originalname.endsWith(".ppt")
) {
  try {
    const text = await new Promise<string>((resolve, reject) => {
      parseOffice(file.buffer, (ast: any, err: any) => {
        if (err) return reject(err);

        try {
          // 🔥 Extract text from AST
          let extractedText = "";

          const traverse = (node: any) => {
            if (!node) return;

            if (typeof node === "string") {
              extractedText += node + " ";
            }

            if (Array.isArray(node)) {
              node.forEach(traverse);
            }

            if (typeof node === "object") {
              Object.values(node).forEach(traverse);
            }
          };

          traverse(ast);

          resolve(extractedText);
        } catch (e) {
          reject(e);
        }
      });
    });

    if (!text || text.trim().length < 10) {
      throw new Error("Empty PPT");
    }

    return text;

  } catch (err) {
    console.error("PPT parsing failed:", err);
    throw new BadRequestException("Failed to read PPT file");
  }
}
    throw new BadRequestException("Unsupported file");
  }

  //////////////////////////////////////////////////////
  // ✂️ CHUNKING
  //////////////////////////////////////////////////////
  chunkText(text: string): string[] {
    return text
      .split(/\n\s*\n/)
      .map((c) => c.trim())
      .filter((c) => c.length > 80)
      .slice(0, 200);
  }

  //////////////////////////////////////////////////////
  // 🧠 STORE CHUNKS
  //////////////////////////////////////////////////////
  async storeChunks(text: string, versionId: number) {
    const chunks = this.chunkText(text);

    for (const chunk of chunks) {
      const embedding = await this.ragService.getEmbedding(chunk);
      if (!embedding?.length) continue;

      await this.prisma.$executeRawUnsafe(`
        INSERT INTO "Chunk" (content, embedding, "versionId")
        VALUES (
          '${chunk.replace(/'/g, "''")}',
          '[${embedding.join(',')}]'::vector,
          ${versionId}
        );
      `);
    }
  }

  //////////////////////////////////////////////////////
  // 📂 SIDEBAR
  //////////////////////////////////////////////////////
  async getUserDocuments(userId: number) {
    return this.prisma.document.findMany({
      where: { userId },
      include: {
        versions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        chats: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }
}