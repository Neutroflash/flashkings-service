import { IUserRepository } from "../../domain/repositories/IUserRepository";
import { PasswordHasher } from "../../infrastructure/security/PasswordHasher";
import { hashSecureToken } from "../../infrastructure/security/secureToken";
import { AppError } from "../../shared/errors/AppError";

export class ResetPasswordUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(token: string, newPassword: string): Promise<void> {
    const user = await this.userRepository.findByPasswordResetToken(hashSecureToken(token));
    if (!user) {
      throw new AppError("El enlace no es válido o ya expiró");
    }

    const passwordHash = await PasswordHasher.hash(newPassword);
    await this.userRepository.resetPassword(user.id, passwordHash);
  }
}
