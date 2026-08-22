import { randomUUID } from "crypto";
import { PpobCategory } from "@lapak/shared";
import { CheckBillInput, CheckBillResult, PayBillInput, PayBillResult, PpobProvider } from "./PpobProvider";

/** ~150-400ms — plausible round trip to a real aggregator, without actually being slow in tests/dev. */
function simulateLatency(): Promise<void> {
  const ms = 150 + Math.floor(Math.random() * 250);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Deterministic 32-bit hash (djb2) so the same billerCode+customerNumber always picks the same pool entries. */
function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

function pick<T>(pool: readonly T[], hash: number, salt: number): T {
  return pool[(hash + salt) % pool.length];
}

const CUSTOMER_NAMES = [
  "BUDI SANTOSO",
  "SITI RAHAYU",
  "AGUS PRIYONO",
  "DEWI LESTARI",
  "HENDRA WIJAYA",
  "RATNA SARI",
  "JOKO SUSANTO",
  "NURUL HIDAYAH",
  "BAMBANG SETIAWAN",
  "PUTRI ANGGRAINI",
] as const;

const CURRENT_PERIOD = () => {
  const now = new Date();
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agt", "Sep", "Okt", "Nov", "Des"];
  return `${months[now.getUTCMonth()]} ${now.getUTCFullYear()}`;
};

const PLN_TIERS = ["R1/900VA", "R1/1300VA", "R1/2200VA", "R2/3500VA"] as const;
const MOBILE_OPERATORS = ["Telkomsel", "Indosat", "XL", "Tri", "Smartfren"] as const;
const MOBILE_DENOMS = [10000, 20000, 25000, 50000, 100000] as const;
const PDAM_REGIONS = ["PDAM Kota Bandung", "PDAM Tirta Jaya Yogyakarta", "PDAM Surya Sembada Surabaya", "PDAM Kota Bekasi"] as const;
const BPJS_CLASSES = ["Kelas 1", "Kelas 2", "Kelas 3"] as const;
const EWALLET_BRANDS = ["GoPay", "OVO", "DANA", "ShopeePay"] as const;
const INTERNET_PACKAGES = ["IndiHome 20 Mbps", "IndiHome 40 Mbps", "First Media 30 Mbps", "MyRepublic 50 Mbps"] as const;

/** Fixed provider-side admin fee per category — separate from the merchant's own `biller.marginAmount`. */
const ADMIN_FEE_BY_CATEGORY: Record<PpobCategory, number> = {
  electricity: 2500,
  mobile: 1000,
  water: 2500,
  health_insurance: 2500,
  ewallet: 1000,
  internet_tv: 3000,
  games: 1000,
  tv_voucher: 1000,
  gas: 1000,
};

function buildBillDetails(input: CheckBillInput, hash: number): { meta: string; billAmount: number } {
  switch (input.category) {
    case "electricity": {
      const tier = pick(PLN_TIERS, hash, 1);
      const amount = 80000 + (hash % 42) * 5000; // Rp 80.000 - Rp 285.000
      return { meta: `${tier} · period ${CURRENT_PERIOD()}`, billAmount: amount };
    }
    case "mobile": {
      const operator = pick(MOBILE_OPERATORS, hash, 2);
      const denom = pick(MOBILE_DENOMS, hash, 3);
      return { meta: `${operator} · Pulsa ${denom.toLocaleString("id-ID")}`, billAmount: denom };
    }
    case "water": {
      const region = pick(PDAM_REGIONS, hash, 4);
      const amount = 40000 + (hash % 26) * 4000; // Rp 40.000 - Rp 140.000
      return { meta: `${region} · period ${CURRENT_PERIOD()}`, billAmount: amount };
    }
    case "health_insurance": {
      const tier = pick(BPJS_CLASSES, hash, 5);
      const participants = 1 + (hash % 4);
      const amount = participants * (35000 + (hash % 3) * 40000); // per-participant premium tiers
      return { meta: `${tier} · ${participants} peserta`, billAmount: amount };
    }
    case "ewallet": {
      const brand = pick(EWALLET_BRANDS, hash, 6);
      const denom = pick(MOBILE_DENOMS, hash, 7);
      return { meta: `${brand} · top up ${denom.toLocaleString("id-ID")}`, billAmount: denom };
    }
    case "internet_tv": {
      const pkg = pick(INTERNET_PACKAGES, hash, 8);
      const amount = 180000 + (hash % 26) * 8000; // Rp 180.000 - Rp 380.000
      return { meta: `${pkg} · period ${CURRENT_PERIOD()}`, billAmount: amount };
    }
    case "games":
      return { meta: "Voucher game", billAmount: pick(MOBILE_DENOMS, hash, 9) };
    case "tv_voucher":
      return { meta: "Voucher TV prabayar", billAmount: pick(MOBILE_DENOMS, hash, 10) };
    case "gas":
      return { meta: "Produk gas prabayar", billAmount: pick(MOBILE_DENOMS, hash, 11) };
  }
}

/**
 * Fake aggregator standing in for Digiflazz/Xendit/etc until a real one is
 * wired up. `checkBill` is deterministic per (billerCode, customerNumber) —
 * hashed, not random — so re-checking the same number during a session feels
 * consistent rather than shuffling every tap. `payBill` fails ~5% of the time
 * so the failure path in `ppob.service.ts` is real and exercised, not purely
 * theoretical.
 */
export class MockPpobProvider implements PpobProvider {
  async checkBill(input: CheckBillInput): Promise<CheckBillResult> {
    await simulateLatency();

    const hash = hashString(`${input.billerCode}:${input.customerNumber}`);
    const customerName = pick(CUSTOMER_NAMES, hash, 0);
    const { meta, billAmount } = buildBillDetails(input, hash);
    const adminFee = ADMIN_FEE_BY_CATEGORY[input.category];

    return {
      customerName,
      meta,
      billAmount,
      adminFee,
      providerRef: `mock-chk-${randomUUID()}`,
    };
  }

  async payBill(input: PayBillInput): Promise<PayBillResult> {
    await simulateLatency();

    if (Math.random() < 0.05) {
      return {
        status: "failed",
        providerRef: `mock-fail-${input.billerCode}-${randomUUID()}`,
        paidAt: new Date().toISOString(),
        failureReason: "Provider declined the payment — the aggregator's float for this biller ran out mid-transaction.",
      };
    }

    return {
      status: "success",
      providerRef: `mock-pay-${input.billerCode}-${randomUUID()}`,
      paidAt: new Date().toISOString(),
    };
  }
}
