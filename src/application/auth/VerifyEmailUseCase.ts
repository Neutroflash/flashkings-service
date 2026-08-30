import { IUserRepository } from "../../domain/repositories/IUserRepository";
import { hashSecureToken } from "../../infrastructure/security/secureToken";
import { AppError } from "../../shared/errors/AppError";

export class VerifyEmailUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(token: string): Promise<void> {
    const user = await this.userRepository.findByEmailVerificationToken(hashSecureToken(token));
    if (!user) {
      throw new AppError("El enlace no es válido o ya expiró");
    }

    await this.userRepository.markEmailVerified(user.id);
  }
}
