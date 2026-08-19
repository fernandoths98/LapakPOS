import { CreateProductRequest, Category, Product, UpdateProductRequest } from "@lapak/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { badRequest, notFound } from "../../utils/errors";

type ProductWithCategory = Prisma.ProductGetPayload<{ include: { category: true } }>;
type Tx = Prisma.TransactionClient;

/**
 * Writes a `ProductCostHistory` row ({productId, oldCost, newCost}) when
 * `newCost` differs from `oldCost`, otherwise does nothing. Shared by
 * `updateProduct` below and the catalog importer's upsert-by-barcode commit
 * (`catalog-io.service.ts`) so both paths that can change a product's cost
 * feed the same audit trail — the one the AI recap later reads to notice
 * "cost rose 8%" (Phase 6).
 */
export async function recordCostChangeIfNeeded(tx: Tx, productId: string, oldCost: number, newCost: number): Promise<void> {
  if (oldCost === newCost) return;
  await tx.productCostHistory.create({
    data: { productId, oldCost, newCost },
  });
}

function toProductDto(product: ProductWithCategory): Product {
  return {
    id: product.id,
    merchantId: product.merchantId,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? null,
    name: product.name,
    barcode: product.barcode,
    sellPrice: product.sellPrice,
    costPrice: product.costPrice,
    stockQty: product.stockQty,
    lowStockThreshold: product.lowStockThreshold,
    imageUrl: product.imageUrl,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

export interface ListProductsOptions {
  query?: string;
  category?: string;
}

/**
 * Lists a merchant's catalog, matching the prototype's `visible` filter:
 * case-insensitive name search plus an optional category filter (a
 * `category` of "All" or omitted means no filter, mirroring the pills' "All").
 * Soft-deleted products (deletedAt set) never appear here.
 */
export async function listProducts(merchantId: string, opts: ListProductsOptions): Promise<Product[]> {
  const trimmedQuery = opts.query?.trim();
  const products = await prisma.product.findMany({
    where: {
      merchantId,
      deletedAt: null,
      ...(trimmedQuery ? { name: { contains: trimmedQuery, mode: "insensitive" } } : {}),
      ...(opts.category && opts.category !== "All" ? { category: { name: opts.category } } : {}),
    },
    include: { category: true },
    orderBy: { name: "asc" },
  });
  return products.map(toProductDto);
}

export async function listCategories(merchantId: string): Promise<Category[]> {
  const categories = await prisma.category.findMany({
    where: { merchantId },
    orderBy: { sortOrder: "asc" },
  });
  return categories.map((c) => ({
    id: c.id,
    merchantId: c.merchantId,
    name: c.name,
    sortOrder: c.sortOrder,
  }));
}

/** GET /api/products/:id — a single product, scoped to the merchant, never a soft-deleted one. */
export async function getProductById(merchantId: string, id: string): Promise<Product> {
  const product = await prisma.product.findFirst({
    where: { id, merchantId, deletedAt: null },
    include: { category: true },
  });
  if (!product) {
    throw notFound("Product");
  }
  return toProductDto(product);
}

/**
 * GET /api/products/barcode/:code — powers both the Sell screen's real
 * barcode scan (find-and-add-to-cart) and the Product form's
 * scan-to-check-existing. Scoped to the merchant; never returns a
 * soft-deleted product.
 */
export async function getProductByBarcode(merchantId: string, barcode: string): Promise<Product> {
  const product = await prisma.product.findFirst({
    where: { merchantId, barcode, deletedAt: null },
    include: { category: true },
  });
  if (!product) {
    throw notFound("Product");
  }
  return toProductDto(product);
}

async function assertBarcodeAvailable(merchantId: string, barcode: string, excludeProductId?: string): Promise<void> {
  const existing = await prisma.product.findFirst({
    where: { merchantId, barcode, ...(excludeProductId ? { id: { not: excludeProductId } } : {}) },
  });
  if (existing) {
    throw badRequest(`Barcode ${barcode} is already used by another product${existing.deletedAt ? " (deleted)" : ""}`);
  }
}

/**
 * Creates a product. Rejects a barcode collision within the merchant with a
 * clear message — the schema's `@@unique([merchantId, barcode])` would also
 * reject it, but a raw Prisma unique-constraint error is not a message a
 * cashier should see, so this checks first and throws `badRequest()`.
 */
export async function createProduct(merchantId: string, body: CreateProductRequest): Promise<Product> {
  if (!body.name.trim()) {
    throw badRequest("Product name is required");
  }
  if (body.sellPrice < 0 || body.costPrice < 0) {
    throw badRequest("Prices cannot be negative");
  }
  if (body.stockQty < 0) {
    throw badRequest("Stock cannot be negative");
  }
  if (body.barcode) {
    await assertBarcodeAvailable(merchantId, body.barcode);
  }

  const product = await prisma.product.create({
    data: {
      merchantId,
      categoryId: body.categoryId ?? null,
      name: body.name.trim(),
      barcode: body.barcode ?? null,
      sellPrice: body.sellPrice,
      costPrice: body.costPrice,
      stockQty: body.stockQty,
      lowStockThreshold: body.lowStockThreshold ?? 8,
      imageUrl: body.imageUrl ?? null,
    },
    include: { category: true },
  });
  return toProductDto(product);
}

/**
 * Updates a product. When `costPrice` changes, writes a `ProductCostHistory`
 * row ({productId, oldCost, newCost}) in the same transaction — this is what
 * lets the AI recap genuinely notice "cost rose 8%" later (Phase 6), so it
 * must never be skipped just because the update also touches other fields.
 */
export async function updateProduct(merchantId: string, id: string, body: UpdateProductRequest): Promise<Product> {
  const existing = await prisma.product.findFirst({ where: { id, merchantId, deletedAt: null } });
  if (!existing) {
    throw notFound("Product");
  }

  if (body.name !== undefined && !body.name.trim()) {
    throw badRequest("Product name is required");
  }
  if (body.sellPrice !== undefined && body.sellPrice < 0) {
    throw badRequest("Sell price cannot be negative");
  }
  if (body.costPrice !== undefined && body.costPrice < 0) {
    throw badRequest("Cost price cannot be negative");
  }
  if (body.stockQty !== undefined && body.stockQty < 0) {
    throw badRequest("Stock cannot be negative");
  }
  if (body.barcode) {
    await assertBarcodeAvailable(merchantId, body.barcode, id);
  }

  const product = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
        ...(body.barcode !== undefined ? { barcode: body.barcode } : {}),
        ...(body.sellPrice !== undefined ? { sellPrice: body.sellPrice } : {}),
        ...(body.costPrice !== undefined ? { costPrice: body.costPrice } : {}),
        ...(body.stockQty !== undefined ? { stockQty: body.stockQty } : {}),
        ...(body.lowStockThreshold !== undefined ? { lowStockThreshold: body.lowStockThreshold } : {}),
        ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
      },
      include: { category: true },
    });

    if (body.costPrice !== undefined) {
      await recordCostChangeIfNeeded(tx, id, existing.costPrice, body.costPrice);
    }

    return updated;
  });

  return toProductDto(product);
}

/** Soft-deletes a product (sets deletedAt) rather than removing the row — sale history keeps its foreign key. */
export async function deleteProduct(merchantId: string, id: string): Promise<void> {
  const existing = await prisma.product.findFirst({ where: { id, merchantId, deletedAt: null } });
  if (!existing) {
    throw notFound("Product");
  }
  await prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
}
