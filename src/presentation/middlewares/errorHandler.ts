import { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { AppError } from "../../shared/errors/AppError";
import { env } from "../../config/env";
import { logger } from "../../infrastructure/logging/logger";

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    // Expected/handled errors (4xx) are noise at error level — client mistakes, not bugs.
    logger.warn({ statusCode: err.statusCode, path: req.originalUrl }, err.message);
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ error: "Datos de entrada inválidos", details: err.flatten() });
    return;
  }

  logger.error({ err, path: req.originalUrl }, "Unhandled error");
  res.status(500).json({
    error: "Error interno del servidor",
    ...(env.isProduction ? {} : { detail: err instanceof Error ? err.message : String(err) }),
  });
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.originalUrl}` });
}
