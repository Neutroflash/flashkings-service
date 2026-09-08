import express, { Application } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { apiRouter } from "./presentation/routes";
import { errorHandler, notFoundHandler } from "./presentation/middlewares/errorHandler";
import { env } from "./config/env";
import { logger } from "./infrastructure/logging/logger";
import { ForbiddenError } from "./shared/errors/AppError";

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
        // Un Error pelado acá termina en el catch-all del errorHandler y sale como 500, que es
        // mentira: el servidor no falló, rechazó el origen a propósito. Peor aún, disfraza un
        // problema de configuración de "Internal Server Error" y manda a buscar el bug al lugar
        // equivocado — pasó exactamente eso al diagnosticar los deployments de preview de Vercel.
        // Con un AppError tipado, el mismo errorHandler responde 403 y dice la verdad.
        //
        // Se sigue cortando acá, antes de que la petición llegue a su handler. La alternativa
        // canónica del paquete cors —`callback(null, false)`, omitir los headers y dejarla pasar—
        // también funcionaría (el navegador bloquea igual, porque lo que protege es la ausencia
        // del header), pero haría que un origen ajeno sí ejecutara el endpoint. No hay razón para
        // relajar eso ahora: lo que estaba mal era el código de estado, no el corte.
        logger.warn({ origin }, "Blocked CORS request from disallowed origin");
        callback(new ForbiddenError("Origen no permitido por la política de CORS"));
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
