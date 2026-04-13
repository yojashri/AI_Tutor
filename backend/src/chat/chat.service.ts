import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  
  //  CREATE CHAT SESSION (FIXED ORDER 🔥)
  
  async createSession(
    userId: number,
    documentId: number | null,
    versionId: number | null
  ) {
    if (!userId) {
      throw new BadRequestException("Invalid user");
    }

    return this.prisma.chatSession.create({
      data: {
        userId,
        ...(documentId ? { documentId } : {}),
        ...(versionId ? { versionId } : {}),
      },
    });
  }

  
  //  SAVE MESSAGE
  
  async saveMessage(
    chatSessionId: number,
    role: "user" | "assistant",
    content: string
  ) {
    if (!chatSessionId) {
      throw new BadRequestException("Invalid chatSessionId");
    }

    if (!content?.trim()) {
      throw new BadRequestException("Message cannot be empty");
    }

    return this.prisma.message.create({
      data: {
        chatSessionId,
        role,
        content,
      },
    });
  }

  
  //  GET MESSAGES
  
  async getMessages(chatSessionId: number, userId: number) {
    const chat = await this.prisma.chatSession.findFirst({
      where: {
        id: chatSessionId,
        userId,
      },
    });

    if (!chat) {
      throw new ForbiddenException("Access denied");
    }

    const messages = await this.prisma.message.findMany({
      where: { chatSessionId },
      orderBy: { createdAt: "asc" },
    });

    return {
      messages,
      versionId: chat.versionId ?? null,
      documentId: chat.documentId ?? null,
    };
  }

  
  //  DELETE CHAT
  
  async deleteChat(chatSessionId: number, userId: number) {
    const chat = await this.prisma.chatSession.findFirst({
      where: {
        id: chatSessionId,
        userId,
      },
    });

    if (!chat) {
      throw new ForbiddenException("Chat not found");
    }

    await this.prisma.chatSession.delete({
      where: { id: chatSessionId },
    });

    return { message: "Chat deleted ✅" };
  }

  
  //  GET USER CHATS (SIDEBAR  FINAL)
  
  async getUserChats(userId: number) {
    if (!userId) {
      throw new BadRequestException("Invalid user");
    }

    const chats = await this.prisma.chatSession.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" }, //  IMPORTANT
      include: {
        document: true,
        messages: {
          take: 1,
          orderBy: { createdAt: "asc" }, // first question
        },
      },
    });

   
    // FORMAT FOR SIDEBAR
   
    return chats.map((chat) => ({
      id: chat.id,
      versionId: chat.versionId ?? null,
      document: chat.document ?? null,
      createdAt: chat.createdAt,

      title:
        chat.document?.name || //  doc
        chat.messages?.[0]?.content?.slice(0, 40) || // 💬 first question
        "New Chat",
    }));
  }

  
  // GET QUESTIONS
  
  async getQuestions(chatSessionId: number, userId: number) {
    const chat = await this.prisma.chatSession.findFirst({
      where: {
        id: chatSessionId,
        userId,
      },
    });

    if (!chat) throw new ForbiddenException("Access denied");

    return this.prisma.message.findMany({
      where: {
        chatSessionId,
        role: "user",
      },
      select: {
        id: true,
        content: true,
      },
      orderBy: { createdAt: "asc" },
    });
  }
}