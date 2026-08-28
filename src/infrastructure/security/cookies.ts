import { CookieOptions, Response } from "express";
import { env } from "../../config/env";

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  sameSite: "strict",
  domain: env.isProduction ? env.cookieDomain : undefined,
  path: "/",
};

export const ACCESS_TOKEN_COOKIE = "flashkings_access_token";
export const REFRESH_TOKEN_COOKIE = "flashkings_refresh_token";

export function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    ...baseCookieOptions,
    maxAge: 15 * 60 * 1000, // 15 minutes, mirrors JWT_ACCESS_EXPIRES_IN default
  });
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    ...baseCookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days, mirrors JWT_REFRESH_EXPIRES_IN default
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, baseCookieOptions);
  res.clearCookie(REFRESH_TOKEN_COOKIE, baseCookieOptions);
}
