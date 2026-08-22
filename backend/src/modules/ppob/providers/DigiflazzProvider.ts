import { createHash, randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, resolve } from "path";
import axios, { AxiosInstance } from "axios";
import { env } from "../../../config/env";
import { PrepaidProduct } from "@lapak/shared";
import { CheckBillInput, CheckBillResult, PayBillInput, PayBillResult, PpobProvider } from "./PpobProvider";
import { MockPpobProvider } from "./MockPpobProvider";

type DigiflazzStatus = "Sukses" | "Pending" | "Gagal";

interface DigiflazzPostpaidData {
  ref_id: string;
  customer_no: string;
  customer_name?: string;
  buyer_sku_code: string;
  admin?: number;
  message: string;
  status: DigiflazzStatus;
  rc: string;
  periode?: string;
  price?: number;
  selling_price?: number;
  sn?: string;
  desc?: Record<string, unknown>;
}

interface DigiflazzEnvelope<T> { data: T }

interface DigiflazzPrepaidProduct {
  product_name: string; category: string; brand: string; type: string; price: number;
  buyer_sku_code: string; buyer_product_status: boolean; seller_product_status: boolean;
  unlimited_stock: boolean; stock: number; desc: string;
}

let productCache: { expiresAt: number; rows: PrepaidProduct[] } | null = null;
let productLoadPromise: Promise<PrepaidProduct[]> | null = null;
const PRODUCT_CACHE_PATH = resolve(process.cwd(), ".cache", "digiflazz-prepaid-products.json");
const VERIFIED_PLN_PRODUCTS: PrepaidProduct[] = [
  { skuCode: "pln20", name: "PLN 20.000", category: "PLN", brand: "PLN", type: "Umum", price: 21960, description: "Token listrik PLN Rp20.000" },
  { skuCode: "pln50", name: "PLN 50.000", category: "PLN", brand: "PLN", type: "Umum", price: 51625, description: "Token listrik PLN Rp50.000" },
  { skuCode: "pln100", name: "PLN 100.000", category: "PLN", brand: "PLN", type: "Umum", price: 101805, description: "Token listrik PLN Rp100.000" },
  { skuCode: "pln1000", name: "PLN 1.000.000", category: "PLN", brand: "PLN", type: "Umum", price: 1001475, description: "Token listrik PLN Rp1.000.000" },
];

async function readPersistentProducts(): Promise<PrepaidProduct[]> {
  try {
    const parsed = JSON.parse(await readFile(PRODUCT_CACHE_PATH, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function savePersistentProducts(rows: PrepaidProduct[]): Promise<void> {
  try {
    await mkdir(dirname(PRODUCT_CACHE_PATH), { recursive: true });
    await writeFile(PRODUCT_CACHE_PATH, JSON.stringify(rows), "utf8");
  } catch {
    // A read-only filesystem must not make PPOB unavailable; memory cache
    // and the verified PLN fallback still protect the sales flow.
  }
}

function credentials() {
  const username = env.DIGIFLAZZ_USERNAME;
  const key = env.DIGIFLAZZ_MODE === "production" ? env.DIGIFLAZZ_PRODUCTION_KEY : env.DIGIFLAZZ_DEVELOPMENT_KEY;
  if (!username || !key) throw new Error(`Kredensial Digiflazz ${env.DIGIFLAZZ_MODE} belum dikonfigurasi.`);
  return { username, key };
}

function sign(username: string, key: string, refId: string): string {
  return createHash("md5").update(`${username}${key}${refId}`).digest("hex");
}

function metaFrom(data: DigiflazzPostpaidData): string {
  const details = [data.periode, data.desc?.tarif, data.desc?.daya ? `${data.desc.daya} VA` : undefined];
  return details.filter(Boolean).join(" · ") || data.message;
}

export class DigiflazzProvider implements PpobProvider {
  private readonly http: AxiosInstance;
  private readonly developmentPrepaid = new MockPpobProvider();

  constructor(http?: AxiosInstance) {
    this.http = http ?? axios.create({ baseURL: "https://api.digiflazz.com/v1", timeout: 30_000, headers: { "Content-Type": "application/json" } });
  }

  async listPrepaidProducts(): Promise<PrepaidProduct[]> {
    if (productCache && productCache.expiresAt > Date.now()) return productCache.rows;
    if (productLoadPromise) return productLoadPromise;
    productLoadPromise = (async () => {
      const persisted = await readPersistentProducts();
      try {
        const { username, key } = credentials();
        const response = await this.http.post<DigiflazzEnvelope<DigiflazzPrepaidProduct[] | { rc?: string; message?: string }>>("/price-list", {
          cmd: "prepaid", username, sign: sign(username, key, "pricelist"),
        });
        const data = response.data.data;
        if (!Array.isArray(data)) throw new Error(data?.message || `Daftar produk Digiflazz tidak tersedia${data?.rc ? ` (${data.rc})` : ""}.`);
        const rows = data
          .filter(item => item.buyer_product_status && item.seller_product_status && (item.unlimited_stock || Number(item.stock) > 0))
          .map(item => ({ skuCode: item.buyer_sku_code, name: item.product_name, category: item.category, brand: item.brand, type: item.type, price: Number(item.price), description: item.desc || item.product_name }))
          .sort((a, b) => a.price - b.price);
        productCache = { rows, expiresAt: Date.now() + 15 * 60_000 };
        await savePersistentProducts(rows);
        return rows;
      } catch (error) {
        const fallback = persisted.length > 0 ? persisted : VERIFIED_PLN_PRODUCTS;
        productCache = { rows: fallback, expiresAt: Date.now() + 5 * 60_000 };
        // eslint-disable-next-line no-console
        console.warn("Using cached Digiflazz products", { count: fallback.length, reason: error instanceof Error ? error.message : "unknown" });
        return fallback;
      }
    })();
    try {
      return await productLoadPromise;
    } finally {
      productLoadPromise = null;
    }
  }

  async checkBill(input: CheckBillInput): Promise<CheckBillResult> {
    if (input.skuCode) {
      const product = (await this.listPrepaidProducts()).find(item => item.skuCode === input.skuCode);
      if (!product) throw new Error("Produk sudah tidak tersedia. Muat ulang daftar produk.");
      const allowedByCategory: Record<string, string[]> = {
        mobile: ["data", "pulsa", "paket sms", "aktivasi voucher", "aktivasi perdana", "masa aktif"],
        electricity: ["pln"],
        ewallet: ["e-money"],
        games: ["games"],
        tv_voucher: ["tv"],
        gas: ["gas"],
      };
      const allowed = allowedByCategory[input.category] ?? [];
      if (!allowed.some(value => product.category.toLowerCase().includes(value))) throw new Error("Produk tidak sesuai dengan kategori yang dipilih.");
      return { customerName: input.customerNumber, meta: `${product.name} · ${product.description}`, billAmount: product.price, adminFee: 0, providerRef: `prepaid|${product.skuCode}|${randomUUID()}` };
    }
    if (["mobile", "ewallet", "games", "tv_voucher", "gas"].includes(input.category)) {
      if (env.DIGIFLAZZ_MODE === "development") return this.developmentPrepaid.checkBill(input);
      throw new Error("Pilih paket atau nominal terlebih dahulu.");
    }
    const { username, key } = credentials();
    const sku = input.billerCode === "internet_tv" ? "internet" : input.billerCode;
    const refId = `lapak-${randomUUID()}`;
    const response = await this.http.post<DigiflazzEnvelope<DigiflazzPostpaidData>>("/transaction", {
      commands: "inq-pasca",
      username,
      buyer_sku_code: sku,
      customer_no: input.customerNumber,
      ref_id: refId,
      sign: sign(username, key, refId),
      testing: env.DIGIFLAZZ_MODE === "development",
    });
    const data = response.data.data;
    if (data.status !== "Sukses" || data.rc !== "00") throw new Error(data.message || `Inquiry Digiflazz gagal (${data.rc}).`);
    const customerBasePrice = Number(data.selling_price ?? data.price ?? 0);
    const adminFee = Number(data.admin ?? 0);
    return {
      customerName: data.customer_name ?? input.customerNumber,
      meta: metaFrom(data),
      billAmount: Math.max(0, customerBasePrice - adminFee),
      adminFee,
      providerRef: data.ref_id || refId,
    };
  }

  async payBill(input: PayBillInput): Promise<PayBillResult> {
    if (env.DIGIFLAZZ_MODE === "development" && input.checkProviderRef.startsWith("mock-chk-")) {
      return this.developmentPrepaid.payBill(input);
    }
    const { username, key } = credentials();
    if (input.checkProviderRef.startsWith("prepaid|")) {
      const [, sku, refId] = input.checkProviderRef.split("|");
      if (!sku || !refId) throw new Error("Referensi produk prabayar tidak valid.");
      const response = await this.http.post<DigiflazzEnvelope<DigiflazzPostpaidData>>("/transaction", {
        username, buyer_sku_code: sku, customer_no: input.customerNumber, ref_id: refId,
        sign: sign(username, key, refId), max_price: input.billAmount,
      });
      const data = response.data.data;
      const status = data.status === "Sukses" && data.rc === "00" ? "success" : data.status === "Pending" || data.rc === "03" ? "pending" : "failed";
      return { status, providerRef: data.ref_id || refId, paidAt: new Date().toISOString(), failureReason: status === "failed" ? data.message : undefined };
    }
    const refId = input.checkProviderRef;
    const sku = input.billerCode === "internet_tv" ? "internet" : input.billerCode;
    const response = await this.http.post<DigiflazzEnvelope<DigiflazzPostpaidData>>("/transaction", {
      commands: "pay-pasca",
      username,
      buyer_sku_code: sku,
      customer_no: input.customerNumber,
      ref_id: refId,
      sign: sign(username, key, refId),
      testing: env.DIGIFLAZZ_MODE === "development",
    });
    const data = response.data.data;
    const status = data.status === "Sukses" && data.rc === "00" ? "success" : data.status === "Pending" || data.rc === "03" ? "pending" : "failed";
    return { status, providerRef: data.ref_id || refId, paidAt: new Date().toISOString(), failureReason: status === "failed" ? data.message : undefined };
  }
}

export const digiflazzSignature = sign;
