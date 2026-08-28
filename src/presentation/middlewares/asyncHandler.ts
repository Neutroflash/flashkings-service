import { NextFunction, Request, RequestHandler, Response } from "express";

// Express 4 doesn't forward rejected promises to errorHandler on its own;
// this wrapper does so every async controller reaches the centralized errorHandler.
export function asyncHandler(fn: RequestHandler): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
