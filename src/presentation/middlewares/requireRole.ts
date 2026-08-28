import { NextFunction, Request, Response } from "express";
import { Role } from "../../domain/entities/User";
import { ForbiddenError, UnauthorizedError } from "../../shared/errors/AppError";

/** Must run after authenticateJWT. Restricts an endpoint to one or more roles (RBAC). */
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      throw new UnauthorizedError();
    }
    if (!allowedRoles.includes(req.user.role)) {
      throw new ForbiddenError("No tienes permisos para acceder a este recurso");
    }
    next();
  };
}
