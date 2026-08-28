import { OutletInventoryItem, UpdateInventoryRequest } from "@lapak/shared";
import { prisma } from "../../db/prisma";
import { badRequest, forbidden, notFound } from "../../utils/errors";

type Row = {
  productId: string;
  stockQty: number;
  lowStockThreshold: number;
  priceOverride: number | null;
  isAvailable: boolean;
  product: { name: string; barcode: string | null; sellPrice: number; costPrice: number; category: { name: string } | null };
};

function toItem(row: Row): OutletInventoryItem {
  return {
    productId: row.productId,
    name: row.product.name,
    barcode: row.product.barcode,
    categoryName: row.product.category?.name ?? null,
    referenceSellPrice: row.product.sellPrice,
    costPrice: row.product.costPrice,
    stockQty: row.stockQty,
    lowStockThreshold: row.lowStockThreshold,
    priceOverride: row.priceOverride,
    effectivePrice: row.priceOverride ?? row.product.sellPrice,
    isAvailable: row.isAvailable,
  };
}

/** GET /api/inventory — every catalog product with this outlet's own stock, price and availability. */
export async function listInventory(merchantId: string, outletId: string): Promise<OutletInventoryItem[]> {
  const rows = await prisma.outletProduct.findMany({
    where: { outletId, deletedAt: null, product: { merchantId, deletedAt: null } },
    include: { product: { include: { category: true } } },
    orderBy: { product: { name: "asc" } },
  });
  return rows.map(toItem);
}

/**
 * PATCH /api/inventory/:productId — set this outlet's stock, threshold,
 * availability and/or price override for one product. A franchise outlet
 * whose agreement forbids price overrides cannot set `priceOverride`.
 */
export async function updateInventory(
  merchantId: string,
  outletId: string,
  productId: string,
  body: UpdateInventoryRequest,
): Promise<OutletInventoryItem> {
  const product = await prisma.product.findFirst({ where: { id: productId, merchantId, deletedAt: null }, select: { id: true } });
  if (!product) throw notFound("Product");

  if (body.stockQty !== undefined && (!Number.isInteger(body.stockQty) || body.stockQty < 0)) {
    throw badRequest("Stock cannot be negative");
  }
  if (body.priceOverride !== undefined && body.priceOverride !== null && (!Number.isInteger(body.priceOverride) || body.priceOverride < 0)) {
    throw badRequest("Price override cannot be negative");
  }
  if (body.lowStockThreshold !== undefined && (!Number.isInteger(body.lowStockThreshold) || body.lowStockThreshold < 0)) {
    throw badRequest("Low-stock threshold cannot be negative");
  }

  if (body.priceOverride !== undefined) {
    const agreement = await prisma.franchiseAgreement.findUnique({
      where: { outletId },
      select: { allowPriceOverride: true, status: true },
    });
    if (agreement && agreement.status === "active" && !agreement.allowPriceOverride) {
      throw forbidden("Harga outlet ini diatur oleh pusat (franchise)");
    }
  }

  const row = await prisma.outletProduct.upsert({
    where: { outletId_productId: { outletId, productId } },
    update: {
      ...(body.stockQty !== undefined ? { stockQty: body.stockQty } : {}),
      ...(body.lowStockThreshold !== undefined ? { lowStockThreshold: body.lowStockThreshold } : {}),
      ...(body.priceOverride !== undefined ? { priceOverride: body.priceOverride } : {}),
      ...(body.isAvailable !== undefined ? { isAvailable: body.isAvailable } : {}),
    },
    create: {
      outletId,
      productId,
      stockQty: body.stockQty ?? 0,
      lowStockThreshold: body.lowStockThreshold ?? 8,
      priceOverride: body.priceOverride ?? null,
      isAvailable: body.isAvailable ?? true,
    },
    include: { product: { include: { category: true } } },
  });
  return toItem(row);
}
