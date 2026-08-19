import { TenderType, UserRole } from "../constants";
import { AiChatMessage, Expense, Merchant, PpobBiller, PpobTransaction, Product, Sale, Shift } from "./domain";

// ── Auth ──────────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: { id: string; name: string; email: string; role: UserRole; merchantId: string };
}

// ── Products ──────────────────────────────────────────────────────────────

export interface CreateProductRequest {
  name: string;
  categoryId?: string | null;
  barcode?: string | null;
  sellPrice: number;
  costPrice: number;
  stockQty: number;
  lowStockThreshold?: number;
  imageUrl?: string | null;
}

export type UpdateProductRequest = Partial<CreateProductRequest>;

export interface PhotoFillRequest {
  imageBase64: string;
  mimeType: string;
}

export interface PhotoFillResponse {
  name: string | null;
  size: string | null;
  barcode: string | null;
}

// ── Catalog import/export ────────────────────────────────────────────────

export interface ImportPreviewRequest {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
}

export interface ImportColumnMapping {
  column: string;
  field: "name" | "sellPrice" | "costPrice" | "stockQty" | "barcode" | "ignored";
  needsReview: boolean;
}

export interface ImportPreviewResponse {
  previewId: string;
  totalRows: number;
  mapping: ImportColumnMapping[];
  flaggedRowCount: number;
  flaggedReasons: string[];
  importableRowCount: number;
}

export interface ImportCommitRequest {
  previewId: string;
}

export interface ImportCommitResponse {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
}

// ── Sales ─────────────────────────────────────────────────────────────────

export interface CreateSaleLineItemRequest {
  productId: string;
  qty: number;
}

export interface CreateSaleRequest {
  clientId: string;
  lineItems: CreateSaleLineItemRequest[];
  tenderType: TenderType;
  cashAmount: number;
  qrisAmount: number;
  discount?: number;
  createdOffline?: boolean;
}

export interface TodaySummaryResponse {
  total: number;
  count: number;
  avgTicket: number;
  pctChangeVsYesterday: number;
  tenderMix: { label: string; amount: number; pct: number }[];
}

// ── Merchant ──────────────────────────────────────────────────────────────

/** GET /api/merchant/me — the caller's own merchant record. Same shape as the `Merchant` domain type. */
export type MerchantResponse = Merchant;

// ── Home ──────────────────────────────────────────────────────────────────

/**
 * One rule-based "needs attention" item — low stock or a supplier cost
 * increase (see home.service.ts). Never AI-generated; `meta` is either a
 * plain restock nudge or a derived suggested price, never a fabricated number.
 */
export interface HomeAlert {
  text: string;
  meta: string;
}

export interface HomeAlertsResponse {
  alerts: HomeAlert[];
}

// ── Shifts ────────────────────────────────────────────────────────────────

export interface OpenShiftRequest {
  openingFloat: number;
}

export interface CloseShiftRequest {
  countedCash: number;
}

export interface CloseShiftResponse {
  shift: Shift;
  expectedCash: number;
  countedCash: number;
  discrepancy: number;
  discrepancyTitle: string;
  discrepancyBody: string;
}

/**
 * The same arithmetic `CloseShiftResponse` reports, computed live against
 * whatever sales/PPOB/expenses are attached to the shift so far — used both
 * to preview the running numbers on an open shift (`GetCurrentShiftResponse`)
 * and to answer the Z-report query on any shift, open or closed.
 */
export interface ShiftRunningTotals {
  openingFloat: number;
  cashSales: number;
  ppobCashIn: number;
  paidOut: number;
  expectedCash: number;
}

export interface GetCurrentShiftResponse {
  shift: Shift | null;
  /** Live running totals for `shift`, or null when there's no open shift. */
  running: ShiftRunningTotals | null;
}

export interface ZReportResponse {
  shift: Shift;
  running: ShiftRunningTotals;
  /** null only if the shift hasn't been closed (no countedCash to compare against) yet. */
  discrepancy: number | null;
}

// ── Expenses ──────────────────────────────────────────────────────────────

export interface CreateExpenseRequest {
  amount: number;
  note?: string;
}

// ── PPOB ──────────────────────────────────────────────────────────────────

export interface CheckBillRequest {
  billerId: string;
  customerNumber: string;
}

export interface CheckBillResponse {
  checkRef: string;
  customerName: string;
  meta: string;
  billAmount: number;
  adminFee: number;
  marginAmount: number;
  customerPays: number;
}

export interface PayBillRequest {
  billerId: string;
  customerNumber: string;
  checkRef: string;
}

export interface PayBillResponse {
  transaction: PpobTransaction;
}

export interface PpobCommissionSummaryResponse {
  commissionThisMonth: number;
  deposit: number;
}

// ── Recap / AI ────────────────────────────────────────────────────────────

export interface RecapInsight {
  title: string;
  body: string;
  action: string;
}

export interface DailyRecapResponse {
  recapDate: string;
  headline: string;
  body: string;
  insights: RecapInsight[];
  generatedAt: string;
  aiAvailable: boolean;
}

export interface AskRequest {
  message: string;
}

export interface AskResponse {
  reply: string;
  /**
   * false whenever `reply` is NOT a real Claude answer — either the honest
   * "AI isn't available" message (`!aiEnabled` on the backend) or the
   * "couldn't reach the AI assistant" fallback after a transient failure.
   * Mirrors `DailyRecapResponse.aiAvailable` so the mobile Ask tab can show
   * the same kind of honest banner the Story tab already does.
   */
  aiAvailable: boolean;
}

/** GET /api/recap/ask/history — the merchant/user's persisted chat thread, oldest first. */
export interface AskHistoryResponse {
  messages: AiChatMessage[];
}

export interface WeeklyBar {
  label: string;
  total: number;
  ppobShare: number;
}

export interface TopSeller {
  name: string;
  qty: number;
  margin: number;
}

export interface WeeklyReportsResponse {
  bars: WeeklyBar[];
  topSellers: TopSeller[];
}

export interface ApiErrorBody {
  error: string;
  message: string;
}

export type { Product, Sale, Shift, PpobBiller, Expense, Merchant };
