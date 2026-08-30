import { IUserRepository } from "../../domain/repositories/IUserRepository";
import { IEmailService } from "../../domain/services/IEmailService";
import { generateSecureToken, hashSecureToken } from "../../infrastructure/security/secureToken";
import { logger } from "../../infrastructure/logging/logger";
import { env } from "../../config/env";

const RESET_TOKEN_TTL_MINUTES = 30;

/**
 * Siempre resuelve igual, exista o no ese correo — nunca revelar si un email está registrado es
 * lo que evita que este endpoint sirva para enumerar usuarios (mismo criterio que saas-erp-pe).
 */
export class ForgotPasswordUseCase {
  constructor(
    private readonly userRepository: IUserRepository,
    private readonly emailService: IEmailService,
  ) {}

  async execute(email: string): Promise<void> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) return;

    const token = generateSecureToken();
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
    await this.userRepository.setPasswordResetToken(user.id, hashSecureToken(token), expiresAt);

    const resetUrl = `${env.frontendUrl}/restablecer-password?token=${token}`;
    try {
      await this.emailService.sendPasswordResetEmail(user, resetUrl);
    } catch (err) {
      // El envío puede fallar (proveedor caído, etc.) — no se le filtra al cliente (la respuesta
      // ya es genérica de por sí), pero sí queda en logs para que alguien lo note.
      logger.error({ err, userId: user.id }, "[forgot-password] no se pudo enviar el correo");
    }
  }
}
