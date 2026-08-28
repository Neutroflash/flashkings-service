import { Router } from "express";
import { authRoutes } from "./authRoutes";
import { productRoutes } from "./productRoutes";
import { categoryRoutes } from "./categoryRoutes";
import { orderRoutes } from "./orderRoutes";
import { paymentRoutes } from "./paymentRoutes";
import { adminOrderRoutes } from "./adminOrderRoutes";
import { complaintRoutes } from "./complaintRoutes";
import { adminComplaintRoutes } from "./adminComplaintRoutes";

export const apiRouter = Router();

apiRouter.use("/auth", authRoutes);
apiRouter.use("/products", productRoutes);
apiRouter.use("/categories", categoryRoutes);
apiRouter.use("/orders", orderRoutes);
apiRouter.use("/payments", paymentRoutes);
apiRouter.use("/admin/orders", adminOrderRoutes);
apiRouter.use("/complaints", complaintRoutes);
apiRouter.use("/admin/complaints", adminComplaintRoutes);
