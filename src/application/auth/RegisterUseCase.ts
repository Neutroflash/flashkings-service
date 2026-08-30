import { IUserRepository } from "../../domain/repositories/IUserRepository";
import { IOrderRepository } from "../../domain/repositories/IOrderRepository";
import { IEmailService } from "../../domain/services/IEmailService";
import { PasswordHasher } from "../../infrastructure/security/PasswordHasher";
import { generateSecureToken, hashSecureToken } from "../../infrastructure/security/secureToken";
import { logger } from "../../infrastructure/logging/logger";
import { env } from "../../config/env";
import { ConflictError } from "../../shared/errors/AppError";
import { SafeUser, toSafeUser } from "../../domain/entities/User";

const EMAIL_VERIFICATION_TOKEN_TTL_DAYS = 7;

export interface RegisterInput {
  email: string;
  password: string;
  name: string;
}

export class RegisterUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly orderRepository: IOrderRepository,
    private readonly emailService: IEmailService,
  ) {}

  async execute(input: RegisterInput): Promise<SafeUser> {
    const existing = await this.userRepository.findByEmail(input.email);
    if (existing) {
      throw new ConflictError("Ya existe una cuenta con este correo electrónico");
    }

    const passwordHash = await PasswordHasher.hash(input.password);
    const verificationToken = generateSecureToken();
    const user = await this.userRepository.create({
      email: input.email,
      passwordHash,
      name: input.name,
      emailVerificationTokenHash: hashSecureToken(verificationToken),
      emailVerificationTokenExpiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000),
    });

    // Claims any past guest orders placed with this email — see the comment on
    // IOrderRepository.linkOrdersToUser.
    await this.orderRepository.linkOrdersToUser(user.email, user.id);

    // Best-effort, nunca bloquea el registro — ver el comentario en el schema sobre por qué la
    // verificación de email no es obligatoria para usar la cuenta.
    try {
      const verifyUrl = `${env.frontendUrl}/verificar-email?token=${verificationToken}`;
      await this.emailService.sendVerificationEmail(user, verifyUrl);
    } catch (err) {
      logger.error({ err, userId: user.id }, "[register] no se pudo enviar el correo de verificación");
    }

    return toSafeUser(user);
  }
}
