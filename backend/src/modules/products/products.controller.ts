import { Request, Response } from "express";
import { z } from "zod";
import { requireOutlet } from "../../middleware/outlet";
import { requireFeature } from "../subscription/entitlements.service";
import { unauthorized } from "../../utils/errors";
import { saveProductPhoto } from "./products.photo";
import { photoFillProduct } from "./products.photoFill.service";
import * as productsService from "./products.service";

const listProductsQuerySchema = z.object({
  query: z.string().optional(),
  categoryId: z.string().optional(),
  // Legacy name-based filter, still sent by older mobile builds.
  category: z.string().optional(),
});

export async function listProductsHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const { query, categoryId, category } = listProductsQuerySchema.parse(req.query);
  const products = await productsService.listProducts(req.user.merchantId, requireOutlet(req), {
    query,
    categoryId,
    categoryName: category,
  });
  res.json(products);
}

export async function listCategoriesHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const categories = await productsService.listCategories(req.user.merchantId);
  res.json(categories);
}

export async function getProductHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const product = await productsService.getProductById(req.user.merchantId, requireOutlet(req), req.params.id);
  res.json(product);
}

export async function getProductByBarcodeHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const product = await productsService.getProductByBarcode(req.user.merchantId, requireOutlet(req), req.params.code);
  res.json(product);
}

const createProductSchema = z.object({
  name: z.string().min(1),
  categoryId: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  sellPrice: z.number(),
  costPrice: z.number(),
  stockQty: z.number(),
  lowStockThreshold: z.number().optional(),
  imageUrl: z.string().nullable().optional(),
});

export async function createProductHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const body = createProductSchema.parse(req.body);
  const product = await productsService.createProduct(req.user.merchantId, body);
  res.status(201).json(product);
}

const updateProductSchema = createProductSchema.partial();

export async function updateProductHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const body = updateProductSchema.parse(req.body);
  const product = await productsService.updateProduct(req.user.merchantId, requireOutlet(req), req.params.id, body);
  res.json(product);
}

export async function deleteProductHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  await productsService.deleteProduct(req.user.merchantId, req.params.id);
  res.status(204).send();
}

const uploadPhotoSchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().min(1),
});

export async function uploadProductPhotoHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  const { imageBase64, mimeType } = uploadPhotoSchema.parse(req.body);
  const result = saveProductPhoto(imageBase64, mimeType);
  res.status(201).json(result);
}

const photoFillSchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.string().min(1),
});

/**
 * POST /api/products/photo-fill — "Snap to fill". Returns a real 400 (via
 * `photoFillProduct`) when AI isn't configured or the image type isn't
 * vision-supported, rather than faking a successful empty response.
 */
export async function photoFillProductHandler(req: Request, res: Response): Promise<void> {
  if (!req.user) throw unauthorized();
  await requireFeature(req.user.merchantId, "ai");
  const { imageBase64, mimeType } = photoFillSchema.parse(req.body);
  const result = await photoFillProduct(imageBase64, mimeType);
  res.json(result);
}
