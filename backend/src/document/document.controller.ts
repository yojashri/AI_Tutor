import {
  Controller,
  Post,
  Get,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  HttpException,
  HttpStatus,
  UseGuards,
  Req,
  Query, // ✅ IMPORTANT FIX
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentService } from './document.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Express, Request } from 'express';

@Controller('document')
export class DocumentController {
  constructor(private readonly documentService: DocumentService) {}

  //  UPLOAD DOCUMENT 
  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request & { user: any },
    @Query('replace') replace?: string // FIXED
  ) {
    try {
      if (!file) {
        throw new BadRequestException('No file uploaded');
      }

      const userId = req.user?.id;
      if (!userId) {
        throw new BadRequestException('Invalid user');
      }

      const shouldReplace = replace === 'true'; //  FIXED

      console.log("📄 Upload:", file.originalname);
      console.log("👤 User:", userId);
      console.log("♻️ Replace:", shouldReplace);

      const result = await this.documentService.processFile(
        file,
        userId,
        shouldReplace // PASS THIS
      );

      return {
        success: true,
        ...result,
      };

    } catch (error: any) {
      console.error(' Upload Error:', error.message);

      throw new HttpException(
        {
          success: false,
          message: error.message || 'Upload failed',
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }

  //  GET USER DOCUMENTS
  @Get('my-documents')
  @UseGuards(JwtAuthGuard)
  async getMyDocuments(@Req() req: Request & { user: any }) {
    try {
      const userId = req.user?.id;

      const docs = await this.documentService.getUserDocuments(userId);

      const formatted = docs.map((doc) => ({
        id: doc.id,
        name: doc.name,
        versionId: doc.versions?.[0]?.id || null,
        chatSessionId: doc.chats?.[0]?.id || null,
        createdAt: doc.createdAt,
      }));

      return {
        success: true,
        documents: formatted,
      };

    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: error.message,
        },
        HttpStatus.BAD_REQUEST
      );
    }
  }
}