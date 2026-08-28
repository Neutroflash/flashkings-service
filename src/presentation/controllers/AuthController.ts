import { Request, Response } from "express";
import { z } from "zod";
import { RegisterUseCase } from "../../application/auth/RegisterUseCase";
import { LoginUseCase } from "../../application/auth/LoginUseCase";
import { RefreshTokenUseCase } from "../../application/auth/RefreshTokenUseCase";
import { UpdateProfileUseCase } from "../../application/auth/UpdateProfileUseCase";
import { GetCurrentUserUseCase } from "../../application/auth/GetCurrentUserUseCase";
import { clearAuthCookies, REFRESH_TOKEN_COOKIE, setAuthCookies } from "../../infrastructure/security/cookies";
import { UnauthorizedError } from "../../shared/errors/AppError";

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  name: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().trim().min(6).max(20).nullable().optional(),
  defaultAddress: z.string().trim().min(5).nullable().optional(),
});

export class AuthController {
  constructor(
    private readonly registerUseCase: RegisterUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly updateProfileUseCase: UpdateProfileUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
  ) {}

  register = async (req: Request, res: Response): Promise<void> => {
    const input = registerSchema.parse(req.body);
    const user = await this.registerUseCase.execute(input);
    res.status(201).json({ user });
  };

  login = async (req: Request, res: Response): Promise<void> => {
    const input = loginSchema.parse(req.body);
    const { user, accessToken, refreshToken } = await this.loginUseCase.execute(input);
    setAuthCookies(res, accessToken, refreshToken);
    res.status(200).json({ user });
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const refreshToken = req.cookies?.[REFRESH_TOKEN_COOKIE];
    if (!refreshToken) {
      throw new UnauthorizedError("No se encontró un refresh token");
    }
    const { accessToken, refreshToken: newRefreshToken } = await this.refreshTokenUseCase.execute(refreshToken);
    setAuthCookies(res, accessToken, newRefreshToken);
    res.status(200).json({ message: "Token renovado" });
  };

  logout = async (_req: Request, res: Response): Promise<void> => {
    clearAuthCookies(res);
    res.status(200).json({ message: "Sesión cerrada" });
  };

  // req.user carries only the JWT payload (id/email/role) — this resolves the full row
  // (name/phone/defaultAddress) so the account page has something real to render/prefill.
  me = async (req: Request, res: Response): Promise<void> => {
    const user = req.user ? await this.getCurrentUserUseCase.execute(req.user.id) : null;
    res.status(200).json({ user });
  };

  // req.user is guaranteed here — authenticateJWT runs before this handler (see authRoutes.ts).
  updateProfile = async (req: Request, res: Response): Promise<void> => {
    const input = updateProfileSchema.parse(req.body);
    const user = await this.updateProfileUseCase.execute(req.user!.id, input);
    res.status(200).json({ user });
  };
}
