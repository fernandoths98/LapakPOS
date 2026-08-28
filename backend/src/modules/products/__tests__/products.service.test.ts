import { prisma } from "../../../db/prisma";
import { AppError } from "../../../utils/errors";
import * as productsService from "../products.service";

const TEST_MERCHANT_ID = "00000000-0000-0000-0000-000000000098";
const TEST_OUTLET_ID = "00000000-0000-0000-0000-000000000298";

describe("products.service", () => {
  let drinksCategoryId: string;
  let foodCategoryId: string;

  beforeAll(async () => {
    await prisma.merchant.upsert({
      where: { id: TEST_MERCHANT_ID },
      update: {},
      create: { id: TEST_MERCHANT_ID, name: "Products Test Merchant" },
    });
    await prisma.outlet.upsert({
      where: { id: TEST_OUTLET_ID },
      update: {},
      create: { id: TEST_OUTLET_ID, merchantId: TEST_MERCHANT_ID, name: "Products Test Outlet", code: "UTAMA", isPrimary: true },
    });

    const drinks = await prisma.category.create({
      data: { merchantId: TEST_MERCHANT_ID, name: "Drinks", sortOrder: 0 },
    });
    const food = await prisma.category.create({
      data: { merchantId: TEST_MERCHANT_ID, name: "Food", sortOrder: 1 },
    });
    drinksCategoryId = drinks.id;
    foodCategoryId = food.id;

    const seed = [
      { categoryId: drinksCategoryId, name: "Es Kopi Susu Gula Aren", barcode: "9990000000011", sellPrice: 18000, costPrice: 11200, stockQty: 40 },
      { categoryId: foodCategoryId, name: "Indomie Goreng Spesial", barcode: "9990000000028", sellPrice: 4500, costPrice: 2800, stockQty: 6 },
      // No category — the state every product added through the mobile form
      // currently lands in. Must still be reachable via a filter.
      { categoryId: null, name: "Apel Fuji", barcode: "9990000000035", sellPrice: 3000, costPrice: 2000, stockQty: 20 },
    ];
    for (const def of seed) {
      await prisma.product.create({
        data: {
          merchantId: TEST_MERCHANT_ID,
          ...def,
          outletProducts: { create: { outletId: TEST_OUTLET_ID, stockQty: def.stockQty } },
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.saleLineItem.deleteMany({ where: { product: { merchantId: TEST_MERCHANT_ID } } });
    await prisma.productCostHistory.deleteMany({ where: { product: { merchantId: TEST_MERCHANT_ID } } });
    await prisma.outletProduct.deleteMany({ where: { product: { merchantId: TEST_MERCHANT_ID } } });
    await prisma.product.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.category.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.outlet.deleteMany({ where: { merchantId: TEST_MERCHANT_ID } });
    await prisma.merchant.deleteMany({ where: { id: TEST_MERCHANT_ID } });
    await prisma.$disconnect();
  });

  it("lists every product for the outlet with its category name attached", async () => {
    const products = await productsService.listProducts(TEST_MERCHANT_ID, TEST_OUTLET_ID, {});
    expect(products).toHaveLength(3);
    const kopi = products.find((p) => p.name === "Es Kopi Susu Gula Aren");
    expect(kopi?.categoryName).toBe("Drinks");
    expect(kopi?.stockQty).toBe(40);
  });

  it("filters by case-insensitive name search", async () => {
    const products = await productsService.listProducts(TEST_MERCHANT_ID, TEST_OUTLET_ID, { query: "indomie" });
    expect(products).toHaveLength(1);
    expect(products[0].name).toBe("Indomie Goreng Spesial");
  });

  it("filters by category id", async () => {
    const products = await productsService.listProducts(TEST_MERCHANT_ID, TEST_OUTLET_ID, { categoryId: foodCategoryId });
    expect(products).toHaveLength(1);
    expect(products[0].categoryName).toBe("Food");
  });

  it("filters by legacy category name, case-insensitively", async () => {
    const products = await productsService.listProducts(TEST_MERCHANT_ID, TEST_OUTLET_ID, { categoryName: "fOOd" });
    expect(products).toHaveLength(1);
    expect(products[0].categoryName).toBe("Food");
  });

  it("filters to uncategorized products with the 'none' sentinel (id or legacy name)", async () => {
    const byId = await productsService.listProducts(TEST_MERCHANT_ID, TEST_OUTLET_ID, { categoryId: "none" });
    expect(byId.map((p) => p.name)).toEqual(["Apel Fuji"]);
    const byName = await productsService.listProducts(TEST_MERCHANT_ID, TEST_OUTLET_ID, { categoryName: "none" });
    expect(byName.map((p) => p.name)).toEqual(["Apel Fuji"]);
  });

  it("hides an uncategorized product when a real category is selected", async () => {
    const products = await productsService.listProducts(TEST_MERCHANT_ID, TEST_OUTLET_ID, { categoryId: drinksCategoryId });
    expect(products.some((p) => p.name === "Apel Fuji")).toBe(false);
  });

  it("treats an 'all' category as no filter (id or legacy name)", async () => {
    expect(await productsService.listProducts(TEST_MERCHANT_ID, TEST_OUTLET_ID, { categoryId: "all" })).toHaveLength(3);
    expect(await productsService.listProducts(TEST_MERCHANT_ID, TEST_OUTLET_ID, { categoryName: "All" })).toHaveLength(3);
  });

  it("lists categories in sortOrder", async () => {
    const categories = await productsService.listCategories(TEST_MERCHANT_ID);
    expect(categories.map((c) => c.name)).toEqual(["Drinks", "Food"]);
  });

  it("finds a product by barcode, scoped to the outlet", async () => {
    const product = await productsService.getProductByBarcode(TEST_MERCHANT_ID, TEST_OUTLET_ID, "9990000000011");
    expect(product.name).toBe("Es Kopi Susu Gula Aren");
  });

  it("404s on a barcode lookup that doesn't exist", async () => {
    await expect(
      productsService.getProductByBarcode(TEST_MERCHANT_ID, TEST_OUTLET_ID, "0000000000000"),
    ).rejects.toThrow(AppError);
  });

  it("rejects creating a product whose barcode collides with an existing one in the same merchant", async () => {
    await expect(
      productsService.createProduct(TEST_MERCHANT_ID, {
        name: "Duplicate Barcode Product",
        barcode: "9990000000011", // already used by "Es Kopi Susu Gula Aren"
        sellPrice: 5000,
        costPrice: 3000,
        stockQty: 10,
      }),
    ).rejects.toThrow(AppError);
  });

  it("creating a product also creates its per-outlet inventory row", async () => {
    const product = await productsService.createProduct(TEST_MERCHANT_ID, {
      name: "Fresh Barcode Product",
      barcode: "9990000099999",
      sellPrice: 5000,
      costPrice: 3000,
      stockQty: 10,
    });
    expect(product.barcode).toBe("9990000099999");
    expect(product.stockQty).toBe(10);

    const op = await prisma.outletProduct.findUnique({
      where: { outletId_productId: { outletId: TEST_OUTLET_ID, productId: product.id } },
    });
    expect(op?.stockQty).toBe(10);
  });

  it("writes a ProductCostHistory row when costPrice changes on update, and no row when it doesn't", async () => {
    const product = await productsService.createProduct(TEST_MERCHANT_ID, {
      name: "Cost History Product",
      sellPrice: 20000,
      costPrice: 12000,
      stockQty: 5,
    });

    // Updating stock (a per-outlet field) must NOT write a cost-history row...
    await productsService.updateProduct(TEST_MERCHANT_ID, TEST_OUTLET_ID, product.id, { stockQty: 8 });
    const noHistory = await prisma.productCostHistory.findMany({ where: { productId: product.id } });
    expect(noHistory).toHaveLength(0);
    const op = await prisma.outletProduct.findUnique({
      where: { outletId_productId: { outletId: TEST_OUTLET_ID, productId: product.id } },
    });
    expect(op?.stockQty).toBe(8);

    // ...updating costPrice must write exactly one row with the old and new cost.
    const updated = await productsService.updateProduct(TEST_MERCHANT_ID, TEST_OUTLET_ID, product.id, { costPrice: 13000 });
    expect(updated.costPrice).toBe(13000);

    const history = await prisma.productCostHistory.findMany({ where: { productId: product.id } });
    expect(history).toHaveLength(1);
    expect(history[0].oldCost).toBe(12000);
    expect(history[0].newCost).toBe(13000);
  });

  it("soft-deletes a product: deletedAt is set and it disappears from listProducts and getProductById", async () => {
    const product = await productsService.createProduct(TEST_MERCHANT_ID, {
      name: "Soon Deleted Product",
      sellPrice: 9000,
      costPrice: 5000,
      stockQty: 2,
    });

    await productsService.deleteProduct(TEST_MERCHANT_ID, product.id);

    const row = await prisma.product.findUnique({ where: { id: product.id } });
    expect(row?.deletedAt).not.toBeNull();

    await expect(productsService.getProductById(TEST_MERCHANT_ID, TEST_OUTLET_ID, product.id)).rejects.toThrow(AppError);

    const list = await productsService.listProducts(TEST_MERCHANT_ID, TEST_OUTLET_ID, {});
    expect(list.find((p) => p.id === product.id)).toBeUndefined();
  });
});
