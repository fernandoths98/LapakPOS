import { Router } from "express";
import { asyncHandler } from "../../middleware/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import {
  createProductHandler,
  deleteProductHandler,
  getProductByBarcodeHandler,
  getProductHandler,
  listCategoriesHandler,
  listProductsHandler,
  photoFillProductHandler,
  updateProductHandler,
  uploadProductPhotoHandler,
} from "./products.controller";

export const productsRouter = Router();
productsRouter.get("/", requireAuth, asyncHandler(listProductsHandler));
productsRouter.post("/", requireAuth, asyncHandler(createProductHandler));
productsRouter.post("/photo", requireAuth, asyncHandler(uploadProductPhotoHandler));
productsRouter.post("/photo-fill", requireAuth, asyncHandler(photoFillProductHandler));
// Must be registered before "/:id" so a literal "barcode" segment isn't swallowed as an id.
productsRouter.get("/barcode/:code", requireAuth, asyncHandler(getProductByBarcodeHandler));
productsRouter.get("/:id", requireAuth, asyncHandler(getProductHandler));
productsRouter.patch("/:id", requireAuth, asyncHandler(updateProductHandler));
productsRouter.delete("/:id", requireAuth, asyncHandler(deleteProductHandler));

export const categoriesRouter = Router();
categoriesRouter.get("/", requireAuth, asyncHandler(listCategoriesHandler));
