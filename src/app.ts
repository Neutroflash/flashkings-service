import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { apiRouter } from "./presentation/routes";
import { errorHandler, notFoundHandler } from "./presentation/middlewares/errorHandler";
import { env } from "./config/env";
import { logger } from "./infrastructure/logging/logger";

export function createApp(): Application {
  const app = express();

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/health" } }));

  // helmet() covers XSS/sniffing/clickjacking headers (CSP, X-Content-Type-Options,
  // X-Frame-Options DENY, etc.) by default. CSRF protection here isn't a helmet header — it's
  // the combination of SameSite=strict cookies (cookies.ts) + this explicit origin allowlist:
  // credentials:true CORS with a reflected/open origin would defeat that, so origin is never "*".
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header (curl, server-to-server, same-origin) — allow; browsers always send it for CORS-relevant requests.
        if (!origin || env.corsOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        logger.warn({ origin }, "Blocked CORS request from disallowed origin");
        callback(new Error("No permitido por la política de CORS"));
      },
      credentials: true, // required so browsers send/receive the HttpOnly auth cookies
    }),
  );
  // The webhook route needs the raw, unparsed body to verify the gateway's signature
  // (see paymentRoutes.ts, which applies express.raw() to that path specifically).
  app.use((req, res, next) => {
    if (req.originalUrl === "/api/payments/webhook") return next();
    express.json()(req, res, next);
  });
  app.use(cookieParser());

  app.get("/health", (_req, res) => res.status(200).json({ status: "ok" }));
  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
