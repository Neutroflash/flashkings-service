import { NextFunction, Request, Response } from "express";
import { TokenService } from "../../infrastructure/security/TokenService";
import { UnauthorizedError } from "../../shared/errors/AppError";
import { ACCESS_TOKEN_COOKIE } from "../../infrastructure/security/cookies";
import { Role } from "../../domain/entities/User";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; email: string; role: Role };
    }
  }
}

/** Requires a valid access token. Rejects anonymous requests with 401. */
export function authenticateJWT(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (!token) {
    throw new UnauthorizedError("No se encontró un token de acceso");
  }

  try {
    const payload = TokenService.verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    throw new UnauthorizedError("Token de acceso inválido o expirado");
  }
}

/**
 * Same as authenticateJWT but never throws: attaches req.user when a valid
 * token is present, otherwise leaves it undefined. Used on public endpoints
 * (e.g. GET /products) that need to know "is this an ADMIN?" without forcing login.
 */
export function attachUserIfPresent(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (!token) {
    return next();
  }

  try {
    const payload = TokenService.verifyAccessToken(token);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
  } catch {
    // Invalid/expired token on a public route: treat as anonymous rather than failing the request.
  }
  next();
}
