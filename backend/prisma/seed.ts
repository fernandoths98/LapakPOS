import bcrypt from "bcryptjs";
import { prisma } from "../src/db/prisma";

/**
 * Seed logic is filled in as each phase needs data (Phase 1 adds the owner/cashier users,
 * Phase 2 adds products, Phase 4 adds PPOB billers). Kept runnable end-to-end at every phase.
 */
async function main() {
  const merchant = await prisma.merchant.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Warung Sari Rasa",
      address: "Jl. Kaliurang KM 5",
      phone: "0812-3344-9080",
      defaultPrinterName: "RPP02N",
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded merchant ${merchant.name} (${merchant.id})`);

  const ownerEmail = process.env.SEED_OWNER_EMAIL ?? "owner@lapak.test";
  const ownerPassword = process.env.SEED_OWNER_PASSWORD ?? "lapak12345";
  const cashierEmail = process.env.SEED_CASHIER_EMAIL ?? "sari@lapak.test";
  const cashierPassword = process.env.SEED_CASHIER_PASSWORD ?? "lapak12345";

  const [ownerPasswordHash, cashierPasswordHash] = await Promise.all([
    bcrypt.hash(ownerPassword, 10),
    bcrypt.hash(cashierPassword, 10),
  ]);

  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: { passwordHash: ownerPasswordHash, merchantId: merchant.id, role: "owner", name: "Budi" },
    create: {
      id: "00000000-0000-0000-0000-000000000011",
      merchantId: merchant.id,
      name: "Budi",
      email: ownerEmail,
      passwordHash: ownerPasswordHash,
      role: "owner",
    },
  });

  const cashier = await prisma.user.upsert({
    where: { email: cashierEmail },
    update: { passwordHash: cashierPasswordHash, merchantId: merchant.id, role: "cashier", name: "Sari" },
    create: {
      id: "00000000-0000-0000-0000-000000000012",
      merchantId: merchant.id,
      name: "Sari",
      email: cashierEmail,
      passwordHash: cashierPasswordHash,
      role: "cashier",
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded users ${owner.email} (owner), ${cashier.email} (cashier)`);

  // Categories and products ported verbatim from the prototype's PRODUCTS
  // array. Categories have no unique key of their own in the schema, so
  // they're kept idempotent by a find-then-create/update on (merchantId,
  // name) rather than a DB-level upsert. Products carry a stable fake
  // barcode precisely so they *can* upsert on the schema's real unique key
  // (merchantId, barcode) — reseeding never creates duplicates.
  const categoryDefs = [
    { name: "Drinks", sortOrder: 0 },
    { name: "Food", sortOrder: 1 },
    { name: "Grocery", sortOrder: 2 },
  ];

  const categoryIdByName: Record<string, string> = {};
  for (const def of categoryDefs) {
    const existing = await prisma.category.findFirst({ where: { merchantId: merchant.id, name: def.name } });
    const category = existing
      ? await prisma.category.update({ where: { id: existing.id }, data: { sortOrder: def.sortOrder } })
      : await prisma.category.create({ data: { merchantId: merchant.id, name: def.name, sortOrder: def.sortOrder } });
    categoryIdByName[def.name] = category.id;
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded categories: ${categoryDefs.map((c) => c.name).join(", ")}`);

  const productDefs = [
    { name: "Es Kopi Susu Gula Aren", sellPrice: 18000, stockQty: 40, cat: "Drinks", barcode: "8992761100011" },
    { name: "Indomie Goreng Spesial", sellPrice: 4500, stockQty: 6, cat: "Food", barcode: "8992761100028" },
    { name: "Teh Botol 450ml", sellPrice: 6000, stockQty: 88, cat: "Drinks", barcode: "8992761100035" },
    { name: "Roti Bakar Coklat", sellPrice: 15000, stockQty: 12, cat: "Food", barcode: "8992761100042" },
    { name: "Beras Pandan 5kg", sellPrice: 72000, stockQty: 3, cat: "Grocery", barcode: "8992761100059" },
    { name: "Minyak Goreng 1L", sellPrice: 17500, stockQty: 24, cat: "Grocery", barcode: "8992761100066" },
    { name: "Gas LPG 3kg (tukar)", sellPrice: 22000, stockQty: 9, cat: "Grocery", barcode: "8992761100073" },
    { name: "Air Mineral 600ml", sellPrice: 4000, stockQty: 120, cat: "Drinks", barcode: "8992761100080" },
  ];

  for (const def of productDefs) {
    // A plausible cost at ~62% of sell price (roughly the 38% margin the
    // prototype's own "New product" screen shows for its example item).
    const costPrice = Math.round(def.sellPrice * 0.62);
    await prisma.product.upsert({
      where: { merchantId_barcode: { merchantId: merchant.id, barcode: def.barcode } },
      update: {
        name: def.name,
        sellPrice: def.sellPrice,
        stockQty: def.stockQty,
        costPrice,
        categoryId: categoryIdByName[def.cat],
      },
      create: {
        merchantId: merchant.id,
        categoryId: categoryIdByName[def.cat],
        name: def.name,
        barcode: def.barcode,
        sellPrice: def.sellPrice,
        costPrice,
        stockQty: def.stockQty,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${productDefs.length} products`);

  // PPOB billers ported verbatim from the prototype's `billers` array (name,
  // sub, margin). Codes are our own short stable identifiers (the prototype
  // has none) used as the upsert key alongside merchantId, and as the "which
  // biller is this" handle passed to the mock provider.
  const billerDefs = [
    { code: "pln", name: "PLN", sub: "Postpaid & token", category: "electricity" as const, marginAmount: 3000 },
    { code: "pulsa", name: "Pulsa & data", sub: "All operators", category: "mobile" as const, marginAmount: 1500 },
    { code: "pdam", name: "PDAM", sub: "Water, 40 regions", category: "water" as const, marginAmount: 2500 },
    { code: "bpjs", name: "BPJS", sub: "Health premiums", category: "health_insurance" as const, marginAmount: 2500 },
    { code: "ewallet", name: "E-wallet", sub: "GoPay, OVO, DANA", category: "ewallet" as const, marginAmount: 1000 },
    { code: "internet_tv", name: "Internet & TV", sub: "IndiHome, First Media", category: "internet_tv" as const, marginAmount: 3500 },
    { code: "games", name: "Voucher game", sub: "Mobile Legends, Free Fire", category: "games" as const, marginAmount: 2000 },
    { code: "tv_voucher", name: "Voucher TV", sub: "K-Vision dan TV prabayar", category: "tv_voucher" as const, marginAmount: 2000 },
    { code: "gas", name: "Gas", sub: "Produk gas prabayar", category: "gas" as const, marginAmount: 2000 },
  ];

  for (const def of billerDefs) {
    await prisma.ppobBiller.upsert({
      where: { merchantId_code: { merchantId: merchant.id, code: def.code } },
      update: { name: def.name, sub: def.sub, category: def.category, marginAmount: def.marginAmount, isActive: true },
      create: {
        merchantId: merchant.id,
        code: def.code,
        name: def.name,
        sub: def.sub,
        category: def.category,
        marginAmount: def.marginAmount,
      },
    });
  }

  // eslint-disable-next-line no-console
  console.log(`Seeded ${billerDefs.length} PPOB billers`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
