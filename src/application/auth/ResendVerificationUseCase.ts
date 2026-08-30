import { IUserRepository } from "../../domain/repositories/IUserRepository";
import { IEmailService } from "../../domain/services/IEmailService";
import { generateSecureToken, hashSecureToken } from "../../infrastructure/security/secureToken";
import { NotFoundError, ConflictError } from "../../shared/errors/AppError";
import { env } from "../../config/env";

const EMAIL_VERIFICATION_TOKEN_TTL_DAYS = 7;

export class ResendVerificationUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly emailService: IEmailService,
  ) {}

  async execute(userId: string): Promise<void> {
    const user = await this.userRepository.findById(userId);
    if (!user) throw new NotFoundError("Usuario no encontrado");
    if (user.emailVerifiedAt) throw new ConflictError("Este correo ya está verificado");

    const token = generateSecureToken();
    const expiresAt = new Date(Date.now() + EMAIL_VERIFICATION_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
    await this.userRepository.setEmailVerificationToken(user.id, hashSecureToken(token), expiresAt);

    const verifyUrl = `${env.frontendUrl}/verificar-email?token=${token}`;
    await this.emailService.sendVerificationEmail(user, verifyUrl);
  }
}
