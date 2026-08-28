import { PrismaClient } from "@prisma/client";
import { CreateUserData, IUserRepository, UpdateProfileData } from "../../domain/repositories/IUserRepository";
import { User } from "../../domain/entities/User";
import { NotFoundError } from "../../shared/errors/AppError";

export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(data: CreateUserData): Promise<User> {
    return this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name,
        role: "CLIENT",
      },
    });
  }

  async updateProfile(userId: string, data: UpdateProfileData): Promise<User> {
    try {
      return await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          ...(data.defaultAddress !== undefined ? { defaultAddress: data.defaultAddress } : {}),
        },
      });
    } catch {
      throw new NotFoundError("Usuario no encontrado");
    }
  }
}
