import jwt, { SignOptions } from "jsonwebtoken";
import { Role } from "../../domain/entities/User";
import { env } from "../../config/env";

export interface AccessTokenPayload {
  sub: string; // userId
  email: string;
  role: Role;
}

export interface RefreshTokenPayload {
  sub: string; // userId
}

export const TokenService = {
  signAccessToken(payload: AccessTokenPayload): string {
    return jwt.sign(payload, env.jwt.accessSecret, {
      expiresIn: env.jwt.accessExpiresIn,
    } as SignOptions);
  },

  signRefreshToken(payload: RefreshTokenPayload): string {
    return jwt.sign(payload, env.jwt.refreshSecret, {
      expiresIn: env.jwt.refreshExpiresIn,
    } as SignOptions);
  },

  verifyAccessToken(token: string): AccessTokenPayload {
    return jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
  },

  verifyRefreshToken(token: string): RefreshTokenPayload {
    return jwt.verify(token, env.jwt.refreshSecret) as RefreshTokenPayload;
  },
};
