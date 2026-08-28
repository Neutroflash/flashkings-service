import { CookieOptions, Response } from "express";
import { env } from "../../config/env";

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: env.isProduction,
  // "none" in production: without a shared registrable domain between the API and the frontend
  // (see the comment on env.cookieDomain), every request from the frontend to the API is
  // cross-site, and SameSite=Strict/Lax would silently stop the browser from ever sending these
  // cookies back — login would appear to succeed (Set-Cookie arrives) but the session would
  // never actually persist on the next request. CSRF protection then rests on the CORS origin
  // allowlist (app.ts) instead of SameSite — every mutating route already requires a JSON body,
  // which a plain HTML form (the classic CSRF vector) can't send, so it still needs a real
  // fetch()/XHR from an allowlisted origin to pass CORS preflight.
  sameSite: env.isProduction ? "none" : "strict",
  domain: env.cookieDomain,
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
