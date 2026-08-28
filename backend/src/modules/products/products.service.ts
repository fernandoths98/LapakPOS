import { CreateProductRequest, Category, Product, UpdateProductRequest } from "@lapak/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../db/prisma";
import { assertWithinQuota } from "../subscription/entitlements.service";
import { badRequest, notFound } from "../../utils/errors";

type ProductWithCategory = Prisma.ProductGetPayload<{ include: { category: true } }>;
type Tx = Prisma.TransactionClient;

/** The per-outlet fields a product DTO is sourced from once an outlet is known. */
interface OutletProductView {
  stockQty: number;
  lowStockThreshold: number;
  priceOverride: number | null;
}

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

/**
 * A product DTO. Stock, threshold and effective sell price come from the
 * caller's outlet (`op`); when no outlet row is known — a merchant with no
 * outlet yet, or the vestigial `Product.stockQty` snapshot right after
 * create — it falls back to the product's own columns.
 */
function toProductDto(product: ProductWithCategory, op?: OutletProductView | null): Product {
  return {
    id: product.id,
    merchantId: product.merchantId,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? null,
    name: product.name,
    barcode: product.barcode,
    sellPrice: op?.priceOverride ?? product.sellPrice,
    costPrice: product.costPrice,
    stockQty: op?.stockQty ?? product.stockQty,
    lowStockThreshold: op?.lowStockThreshold ?? product.lowStockThreshold,
    imageUrl: product.imageUrl,
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
  };
}

/** Sentinel category filter value: products that have no category at all. */
export const UNCATEGORIZED = "none";

export interface ListProductsOptions {
  query?: string;
  /**
   * Category filter. A real category id filters to that category; the literal
   * `"none"` filters to products with no category — the state every product
   * added through the mobile form currently lands in, and what the Sell/Stock
   * "Tanpa kategori" pill sends; `"all"` or omitted means no filter.
   */
  categoryId?: string;
  /**
   * Legacy name-based category filter, still sent by older mobile builds.
   * Matched case-insensitively so a pill label that differs only in casing
   * from the stored category name still resolves. Ignored when `categoryId`
   * is present.
   */
  categoryName?: string;
}

function buildCategoryFilter(opts: ListProductsOptions): Prisma.ProductWhereInput {
  const categoryId = opts.categoryId?.trim();
  if (categoryId && categoryId.toLowerCase() !== "all") {
    return categoryId.toLowerCase() === UNCATEGORIZED ? { categoryId: null } : { categoryId };
  }

  const categoryName = opts.categoryName?.trim();
  if (categoryName && categoryName.toLowerCase() !== "all") {
    return categoryName.toLowerCase() === UNCATEGORIZED
      ? { categoryId: null }
      : { category: { name: { equals: categoryName, mode: "insensitive" } } };
  }

  return {};
}

/**
 * Lists the catalog for one outlet: case-insensitive name search plus an
 * optional category filter (a real category id, the `"none"` sentinel for
 * uncategorized products, or `"all"`/omitted for no filter — an uncategorized
 * product must always be reachable through *some* filter state). Stock and
 * effective price are the outlet's own (`OutletProduct`); a product the
 * outlet does not carry, and any soft-deleted product, never appear.
 */
export async function listProducts(merchantId: string, outletId: string, opts: ListProductsOptions): Promise<Product[]> {
  const trimmedQuery = opts.query?.trim();
  const rows = await prisma.outletProduct.findMany({
    where: {
      outletId,
      deletedAt: null,
      product: {
        merchantId,
        deletedAt: null,
        ...(trimmedQuery ? { name: { contains: trimmedQuery, mode: "insensitive" } } : {}),
        ...buildCategoryFilter(opts),
      },
    },
    include: { product: { include: { category: true } } },
    orderBy: { product: { name: "asc" } },
  });
  return rows.map((row) => toProductDto(row.product, row));
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

/** GET /api/products/:id — a single product at the caller's outlet, never soft-deleted, never one this outlet doesn't carry. */
export async function getProductById(merchantId: string, outletId: string, id: string): Promise<Product> {
  const row = await prisma.outletProduct.findFirst({
    where: { outletId, deletedAt: null, productId: id, product: { merchantId, deletedAt: null } },
    include: { product: { include: { category: true } } },
  });
  if (!row) {
    throw notFound("Product");
  }
  return toProductDto(row.product, row);
}

/**
 * GET /api/products/barcode/:code — powers both the Sell screen's real
 * barcode scan (find-and-add-to-cart) and the Product form's
 * scan-to-check-existing. Scoped to the caller's outlet; never returns a
 * soft-deleted product or one the outlet doesn't carry.
 */
export async function getProductByBarcode(merchantId: string, outletId: string, barcode: string): Promise<Product> {
  const row = await prisma.outletProduct.findFirst({
    where: { outletId, deletedAt: null, product: { merchantId, barcode, deletedAt: null } },
    include: { product: { include: { category: true } } },
  });
  if (!row) {
    throw notFound("Product");
  }
  return toProductDto(row.product, row);
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
 * Creates a product and its per-outlet inventory rows. Rejects a barcode
 * collision within the merchant with a clear message — the schema's
 * `@@unique([merchantId, barcode])` would also reject it, but a raw Prisma
 * unique-constraint error is not a message a cashier should see, so this
 * checks first and throws `badRequest()`.
 *
 * The entered stock lands on the merchant's primary outlet; every other
 * outlet gets a row at 0, set later from that outlet's stock screen.
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
  await assertWithinQuota(merchantId, "products");
  if (body.barcode) {
    await assertBarcodeAvailable(merchantId, body.barcode);
  }

  const lowStockThreshold = body.lowStockThreshold ?? 8;
  const { product, primaryOp } = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        merchantId,
        categoryId: body.categoryId ?? null,
        name: body.name.trim(),
        barcode: body.barcode ?? null,
        sellPrice: body.sellPrice,
        costPrice: body.costPrice,
        // Vestigial snapshot — real stock lives in OutletProduct from here on.
        stockQty: body.stockQty,
        lowStockThreshold,
        imageUrl: body.imageUrl ?? null,
      },
      include: { category: true },
    });

    const outlets = await tx.outlet.findMany({
      where: { merchantId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
      select: { id: true },
    });
    if (outlets.length > 0) {
      await tx.outletProduct.createMany({
        data: outlets.map((outlet, index) => ({
          outletId: outlet.id,
          productId: created.id,
          stockQty: index === 0 ? body.stockQty : 0,
          lowStockThreshold,
        })),
      });
    }

    return { product: created, primaryOp: outlets[0] ? { stockQty: body.stockQty, lowStockThreshold, priceOverride: null } : null };
  });
  return toProductDto(product, primaryOp);
}

/**
 * Updates a product. Identity fields (name, category, barcode, prices, image)
 * are merchant-level and go on `Product`; `stockQty` and `lowStockThreshold`
 * are per-outlet and go on the `OutletProduct` row for `outletId`. When
 * `costPrice` changes, a `ProductCostHistory` row is written in the same
 * transaction — never skipped just because the update also touches other
 * fields.
 */
export async function updateProduct(
  merchantId: string,
  outletId: string,
  id: string,
  body: UpdateProductRequest,
): Promise<Product> {
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

  const { product, op } = await prisma.$transaction(async (tx) => {
    const updated = await tx.product.update({
      where: { id },
      data: {
        ...(body.name !== undefined ? { name: body.name.trim() } : {}),
        ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
        ...(body.barcode !== undefined ? { barcode: body.barcode } : {}),
        ...(body.sellPrice !== undefined ? { sellPrice: body.sellPrice } : {}),
        ...(body.costPrice !== undefined ? { costPrice: body.costPrice } : {}),
        ...(body.imageUrl !== undefined ? { imageUrl: body.imageUrl } : {}),
      },
      include: { category: true },
    });

    if (body.costPrice !== undefined) {
      await recordCostChangeIfNeeded(tx, id, existing.costPrice, body.costPrice);
    }

    let op: OutletProductView | null = null;
    if (body.stockQty !== undefined || body.lowStockThreshold !== undefined) {
      const row = await tx.outletProduct.upsert({
        where: { outletId_productId: { outletId, productId: id } },
        update: {
          ...(body.stockQty !== undefined ? { stockQty: body.stockQty } : {}),
          ...(body.lowStockThreshold !== undefined ? { lowStockThreshold: body.lowStockThreshold } : {}),
        },
        create: {
          outletId,
          productId: id,
          stockQty: body.stockQty ?? 0,
          lowStockThreshold: body.lowStockThreshold ?? 8,
        },
      });
      op = row;
    } else {
      op = await tx.outletProduct.findUnique({
        where: { outletId_productId: { outletId, productId: id } },
        select: { stockQty: true, lowStockThreshold: true, priceOverride: true },
      });
    }

    return { product: updated, op };
  });

  return toProductDto(product, op);
}

/** Soft-deletes a product (sets deletedAt) rather than removing the row — sale history keeps its foreign key. */
export async function deleteProduct(merchantId: string, id: string): Promise<void> {
  const existing = await prisma.product.findFirst({ where: { id, merchantId, deletedAt: null } });
  if (!existing) {
    throw notFound("Product");
  }
  await prisma.product.update({ where: { id }, data: { deletedAt: new Date() } });
}
