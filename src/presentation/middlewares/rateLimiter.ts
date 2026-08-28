import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { redisConnection } from "../../infrastructure/queue/redisConnection";

// ioredis's `call` covers every Redis command rate-limit-redis needs (INCR/EXPIRE/etc.),
// and reusing the existing connection avoids opening a second Redis client just for this.
function redisStore(prefix: string) {
  return new RedisStore({
    sendCommand: (...args: string[]) => redisConnection.call(args[0], args.slice(1)) as Promise<never>,
    prefix,
  });
}

// Brute-force protection on login: tight window, keyed by IP. Shared across horizontally
// scaled API instances because the counter lives in Redis, not in-process memory.
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiados intentos de inicio de sesión. Intenta de nuevo en unos minutos." },
  store: redisStore("rl:auth:"),
});

// Generous but present ceiling on public catalog endpoints, to blunt scraping/DoS-style bursts
// without affecting normal browsing.
export const catalogLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Demasiadas solicitudes. Intenta de nuevo en un momento." },
  store: redisStore("rl:catalog:"),
});
