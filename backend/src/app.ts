import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { authRouter } from "./modules/auth/auth.routes";
import { catalogIoRouter } from "./modules/catalog-io/catalog-io.routes";
import { categoriesRouter, productsRouter } from "./modules/products/products.routes";
import { ensureUploadsDirExists, UPLOADS_ROOT } from "./modules/products/products.photo";
import { expensesRouter } from "./modules/expenses/expenses.routes";
import { homeRouter } from "./modules/home/home.routes";
import { merchantRouter } from "./modules/merchant/merchant.routes";
import { ppobRouter } from "./modules/ppob/ppob.routes";
import { recapRouter } from "./modules/recap/recap.routes";
import { salesRouter } from "./modules/sales/sales.routes";
import { shiftsRouter } from "./modules/shifts/shifts.routes";
import { subscriptionRouter } from "./modules/subscription/subscription.routes";

export function createApp() {
  const app = express();

  ensureUploadsDirExists();

  app.use(helmet());
  app.use(cors());
  app.use(express.json({
    limit: "10mb",
    verify: (req, _res, buffer) => { (req as express.Request).rawBody = Buffer.from(buffer); },
  })); // generous limit: base64 product photos go through this
  app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));

  // Serves uploaded product photos (backend/uploads/products/<uuid>.<ext>)
  // back out at the imageUrl handed to clients (/uploads/products/...).
  app.use("/uploads", express.static(UPLOADS_ROOT));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "kotdee-pos-backend" });
  });

  // Feature routers are mounted here.
  app.use("/api/auth", authRouter);
  app.use("/api/products", productsRouter);
  app.use("/api/categories", categoriesRouter);
  app.use("/api/sales", salesRouter);
  app.use("/api/catalog", catalogIoRouter);
  app.use("/api/ppob", ppobRouter);
  app.use("/api/shifts", shiftsRouter);
  app.use("/api/expenses", expensesRouter);
  app.use("/api/merchant", merchantRouter);
  app.use("/api/subscription", subscriptionRouter);
  app.use("/api/home", homeRouter);
  app.use("/api/recap", recapRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
