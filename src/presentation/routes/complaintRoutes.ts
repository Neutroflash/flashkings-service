import { Router } from "express";
import { prisma } from "../../infrastructure/database/prisma";
import { PrismaComplaintRepository } from "../../infrastructure/database/PrismaComplaintRepository";
import { eventBus } from "../../infrastructure/events/NodeEventBus";
import { CreateComplaintUseCase } from "../../application/complaints/CreateComplaintUseCase";
import { ComplaintController } from "../controllers/ComplaintController";
import { asyncHandler } from "../middlewares/asyncHandler";
import { catalogLimiter } from "../middlewares/rateLimiter";

const complaintRepository = new PrismaComplaintRepository(prisma);
const complaintController = new ComplaintController(new CreateComplaintUseCase(complaintRepository, eventBus));

export const complaintRoutes = Router();

// Public: filing a Libro de Reclamaciones complaint requires no account. Reuses the catalog
// rate limiter as anti-spam — this endpoint has no auth of its own to lean on.
complaintRoutes.post("/", catalogLimiter, asyncHandler(complaintController.create));
