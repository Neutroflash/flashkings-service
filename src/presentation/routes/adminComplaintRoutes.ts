import { Router } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { PrismaComplaintRepository } from "../../infrastructure/database/PrismaComplaintRepository";
import { ListComplaintsUseCase } from "../../application/complaints/ListComplaintsUseCase";
import { RespondComplaintUseCase } from "../../application/complaints/RespondComplaintUseCase";
import { AdminComplaintController } from "../controllers/AdminComplaintController";
import { asyncHandler } from "../middlewares/asyncHandler";
import { authenticateJWT } from "../middlewares/authenticateJWT";
import { requireRole } from "../middlewares/requireRole";

const complaintRepository = new PrismaComplaintRepository(prisma);
const adminComplaintController = new AdminComplaintController(
  new ListComplaintsUseCase(complaintRepository),
  new RespondComplaintUseCase(complaintRepository),
);

export const adminComplaintRoutes = Router();

adminComplaintRoutes.use(authenticateJWT, requireRole("ADMIN"));

adminComplaintRoutes.get("/", asyncHandler(adminComplaintController.list));
adminComplaintRoutes.patch("/:id/respond", asyncHandler(adminComplaintController.respond));
