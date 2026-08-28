import { IUserRepository } from "../../domain/repositories/IUserRepository";
import { TokenService } from "../../infrastructure/security/TokenService";
import { UnauthorizedError } from "../../shared/errors/AppError";

export interface RefreshTokenResult {
  accessToken: string;
  refreshToken: string;
}

export class RefreshTokenUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(refreshToken: string): Promise<RefreshTokenResult> {
    let payload;
    try {
      payload = TokenService.verifyRefreshToken(refreshToken);
    } catch {
      throw new UnauthorizedError("Refresh token inválido o expirado");
    }

    const user = await this.userRepository.findById(payload.sub);
    if (!user) {
      throw new UnauthorizedError("Usuario no encontrado");
    }

    // Rotate both tokens on refresh to limit the replay window of a stolen refresh token.
    const newAccessToken = TokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const newRefreshToken = TokenService.signRefreshToken({ sub: user.id });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }
}
