import {
  Controller,
  Post,
  Body,
  BadRequestException,
  HttpException,
  HttpStatus,
  Req,
  UseGuards,
} from "@nestjs/common";
import { RagService } from "./rag.service";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { Request } from "express";
import { Throttle} from "@nestjs/throttler";
import { throttle } from "rxjs/internal/operators/throttle";
@Controller("rag")
@UseGuards(JwtAuthGuard)
export class RagController {
  constructor(private ragService: RagService) {}

  //////////////////////////////////////////////////////
  // 💬 ASK QUESTION
  //////////////////////////////////////////////////////
  @Post("ask")
  @Throttle({default: { ttl: 60, limit: 10 }}) // 🔥 RATE LIMITING (10 req/min per user)
  async ask(
    @Req() req: Request & { user: any },
    @Body("question") question: string,
    @Body("versionId") versionId?: number,
    @Body("chatSessionId") chatSessionId?: number,
    @Body("course") course?: string
  ) {
    try {
      ////////////////////////////////////////////
      // ✅ VALIDATION
      ////////////////////////////////////////////
      if (!question || question.trim().length < 3) {
        throw new BadRequestException("Enter a valid question");
      }

      const userId = req.user?.id;

      if (!userId) {
        throw new BadRequestException("Invalid user");
      }

      console.log("💬 Question:", question);
      console.log("📄 Version:", versionId);
      console.log("💬 Chat:", chatSessionId);
      console.log("📘 Course:", course);
      console.log("👤 User:", userId);

      ////////////////////////////////////////////
      // 🔥 CALL SERVICE (FIXED 🔥)
      ////////////////////////////////////////////
      const result = await this.ragService.askQuestion(
        question.trim(),
        versionId ? Number(versionId) : null,      // ✅ FIX
        chatSessionId ? Number(chatSessionId) : null, // ✅ FIX
        userId,                                   // ✅ IMPORTANT
        
      );

      ////////////////////////////////////////////
      // ✅ RESPONSE
      ////////////////////////////////////////////
      return {
        success: true,
        answer: result.answer,
        chatSessionId: result.chatSessionId, // 🔥 VERY IMPORTANT for frontend
      };

    } catch (error: any) {
      console.error("❌ RAG CONTROLLER ERROR:", error.message);

      throw new HttpException(
        {
          success: false,
          message: error.message || "Failed to process question",
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }
}