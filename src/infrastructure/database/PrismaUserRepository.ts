import { Prisma, PrismaClient } from "@prisma/client";
import { CreateUserData, IUserRepository, UpdateProfileData } from "../../domain/repositories/IUserRepository";
import { User } from "../../domain/entities/User";
import { NotFoundError } from "../../shared/errors/AppError";

// Whitelist explícito de columnas — sin esto, el objeto que devuelve Prisma en runtime trae TODAS
// las columnas de la tabla (incluidos los hashes de tokens de reset/verificación), y como
// toSafeUser() arma la respuesta pública con un spread (`...user`), esas columnas "extra" viajaban
// igual aunque el tipo `User` del dominio no las declarara — el tipo de TS no cambia el objeto
// real en runtime. `select` es lo único que de verdad las saca antes de que lleguen tan lejos.
const userSelect = {
  id: true,
  email: true,
  passwordHash: true,
  name: true,
  phone: true,
  defaultAddress: true,
  role: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

type UserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function toDomain(user: UserRow): User {
  return user;
}

export class PrismaUserRepository implements IUserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { email }, select: userSelect });
    return user ? toDomain(user) : null;
  }

  async findById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    return user ? toDomain(user) : null;
  }

  async create(data: CreateUserData): Promise<User> {
    const user = await this.prisma.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        name: data.name,
        role: "CLIENT",
        emailVerificationTokenHash: data.emailVerificationTokenHash,
        emailVerificationTokenExpiresAt: data.emailVerificationTokenExpiresAt,
      },
      select: userSelect,
    });
    return toDomain(user);
  }

  async updateProfile(userId: string, data: UpdateProfileData): Promise<User> {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.phone !== undefined ? { phone: data.phone } : {}),
          ...(data.defaultAddress !== undefined ? { defaultAddress: data.defaultAddress } : {}),
        },
        select: userSelect,
      });
      return toDomain(user);
    } catch {
      throw new NotFoundError("Usuario no encontrado");
    }
  }

  async setPasswordResetToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordResetTokenHash: tokenHash, passwordResetTokenExpiresAt: expiresAt },
    });
  }

  async findByPasswordResetToken(tokenHash: string): Promise<User | null> {
    const user = await this.prisma.user.findFirst({
      where: { passwordResetTokenHash: tokenHash, passwordResetTokenExpiresAt: { gt: new Date() } },
      select: userSelect,
    });
    return user ? toDomain(user) : null;
  }

  async resetPassword(userId: string, passwordHash: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, passwordResetTokenHash: null, passwordResetTokenExpiresAt: null },
    });
  }

  async setEmailVerificationToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerificationTokenHash: tokenHash, emailVerificationTokenExpiresAt: expiresAt },
    });
  }

  async findByEmailVerificationToken(tokenHash: string): Promise<User | null> {
    const user = await this.prisma.user.findFirst({
      where: { emailVerificationTokenHash: tokenHash, emailVerificationTokenExpiresAt: { gt: new Date() } },
      select: userSelect,
    });
    return user ? toDomain(user) : null;
  }

  async markEmailVerified(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date(), emailVerificationTokenHash: null, emailVerificationTokenExpiresAt: null },
    });
  }
}
