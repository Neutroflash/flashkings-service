import { IUserRepository } from "../../domain/repositories/IUserRepository";
import { PasswordHasher } from "../../infrastructure/security/PasswordHasher";
import { TokenService } from "../../infrastructure/security/TokenService";
import { UnauthorizedError } from "../../shared/errors/AppError";
import { SafeUser, toSafeUser } from "../../domain/entities/User";

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  user: SafeUser;
  accessToken: string;
  refreshToken: string;
}

export class LoginUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute(input: LoginInput): Promise<LoginResult> {
    const user = await this.userRepository.findByEmail(input.email);
    if (!user) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    const isPasswordValid = await PasswordHasher.compare(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    const accessToken = TokenService.signAccessToken({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    const refreshToken = TokenService.signRefreshToken({ sub: user.id });

    return { user: toSafeUser(user), accessToken, refreshToken };
  }
}
