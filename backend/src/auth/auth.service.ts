import { Injectable, UnauthorizedException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { JwtService } from "@nestjs/jwt";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";
import * as bcrypt from "bcrypt";

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService
  ) {}

  
  // REGISTER
  
  async register(dto: RegisterDto) {
    const hashed = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        name: dto.name,
        password: hashed,
      },
    });

    return { message: "User registered", user };
  }

  
  // ✅ VALIDATE USER
  
  async validateUser(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user) throw new UnauthorizedException("User not found");

    const isMatch = await bcrypt.compare(
      dto.password,
      user.password
    );

    if (!isMatch)
      throw new UnauthorizedException("Invalid password");

    return user;
  }

  
  // ✅ LOGIN
  
  async login(dto: LoginDto) {
    const user = await this.validateUser(dto);

    const payload = { id: user.id };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: "15m",
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: "7d",
    });

    // ✅ store refresh token in DB
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken },
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    };
  }

  
  // 🔄 REFRESH TOKEN
  
  async refreshToken(token: string) {
    try {
      const payload = this.jwtService.verify(token);

      const user = await this.prisma.user.findUnique({
        where: { id: payload.id },
      });

      if (!user || user.refreshToken !== token) {
        throw new UnauthorizedException("Invalid refresh token");
      }

      const newAccessToken = this.jwtService.sign(
        { id: user.id },
        { expiresIn: "15m" }
      );

      return { accessToken: newAccessToken };
    } catch {
      throw new UnauthorizedException("Invalid token");
    }
  }

  
  // 🚪 LOGOUT
  
  async logout(userId: number) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });

    return { message: "Logged out" };
  }
}