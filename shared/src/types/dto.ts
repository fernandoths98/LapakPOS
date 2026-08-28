import { BusinessType, PlanCode, SubscriptionStatus, TenderType, UserRole } from "../constants";
import { Entitlements, PlanInfo } from "../entitlements";
import { AiChatMessage, Expense, Merchant, PpobBiller, PpobTransaction, Product, Sale, Shift } from "./domain";

// ── Auth ──────────────────────────────────────────────────────────────────

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: { id: string; name: string; email: string; role: UserRole; merchantId: string; outletId?: string | null };
}

export interface RegisterRequest {
  ownerName: string;
  email: string;
  password: string;
  businessName: string;
  businessType: BusinessType;
  phone: string;
  address?: string;
}

export interface RegisterResponse extends LoginResponse {
  merchant: { id: string; name: string; slug: string; businessType: BusinessType; trialEndsAt: string | null };
  outlet: { id: string; name: string; code: string };
  subscription: { planCode: PlanCode; status: SubscriptionStatus; trialEndsAt: string | null };
}

export interface OutletDto { id: string; name: string; code: string; address: string | null; phone: string | null; isPrimary: boolean; type: "owned" | "franchise"; isActive: boolean; createdAt: string }
export interface StaffDto { id: string; name: string; email: string; role: UserRole; outletId: string | null; isActive: boolean; createdAt: string }
export interface AccountSetupResponse {
  merchant: { id: string; name: string; slug: string | null; businessType: BusinessType; onboardingCompleted: boolean; trialEndsAt: string | null };
  subscription: { planCode: PlanCode; status: SubscriptionStatus; trialEndsAt: string | null; currentPeriodEndsAt: string | null } | null;
  outlets: OutletDto[];
  staff: StaffDto[];
}
export interface CreateOutletRequest { name: string; code: string; address?: string; phone?: string; type?: "owned" | "franchise" }
export interface CreateStaffRequest { name: string; email?: string; role: Exclude<UserRole, "owner">; outletId: string; pin: string; password?: string }
export interface PinLoginRequest { businessSlug: string; outletCode: string; pin: string }

// ── Subscription / entitlements ──────────────────────────────────────────

export interface EntitlementUsage {
  outlets: number;
  staff: number;
  products: number;
}

export interface EntitlementsResponse {
  planCode: PlanCode;
  status: SubscriptionStatus;
  entitlements: Entitlements;
  usage: EntitlementUsage;
  currentPeriodEndsAt: string | null;
}

export interface SubscriptionPlansResponse {
  plans: PlanInfo[];
  current: PlanCode;
}

export interface SubscriptionCheckoutRequest {
  /** The paid plan to move to. `free` is never a checkout target. */
  planCode: Exclude<PlanCode, "free">;
  /** Billing periods to pay for at once (1–12). Defaults to 1. */
  months?: number;
}

export interface SubscriptionInvoiceResponse {
  id: string;
  planCode: PlanCode;
  months: number;
  amount: number;
  partnerRef: string;
  qrContent: string;
  status: "pending" | "paid" | "expired" | "failed";
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
}

// ── Per-outlet inventory ────────────────────────────────────────────────

export interface OutletInventoryItem {
  productId: string;
  name: string;
  barcode: string | null;
  categoryName: string | null;
  /** Merchant-level reference price. */
  referenceSellPrice: number;
  costPrice: number;
  stockQty: number;
  lowStockThreshold: number;
  /** null = follows the reference price. */
  priceOverride: number | null;
  /** priceOverride ?? referenceSellPrice */
  effectivePrice: number;
  isAvailable: boolean;
}

export interface UpdateInventoryRequest {
  stockQty?: number;
  lowStockThreshold?: number;
  /** null clears the override (back to the reference price). */
  priceOverride?: number | null;
  isAvailable?: boolean;
}

// ── Multi-outlet report ────────────────────────────────────────────────

export interface OutletReportRow {
  outletId: string;
  outletName: string;
  outletCode: string;
  type: "owned" | "franchise";
  isActive: boolean;
  revenue: number;
  txnCount: number;
  avgTicket: number;
  lowStockCount: number;
  openShift: boolean;
}

export interface OutletReportsResponse {
  /** The window actually reported, after clamping to the plan's history limit. */
  days: number;
  from: string;
  to: string;
  rows: OutletReportRow[];
  totals: { revenue: number; txnCount: number };
}

// ── Franchise ──────────────────────────────────────────────────────────

export interface FranchiseAgreementDto {
  id: string;
  outletId: string;
  outletName: string;
  outletCode: string;
  royaltyPercent: number;
  feeMonthly: number;
  allowPriceOverride: boolean;
  startDate: string;
  status: "active" | "ended";
  notes: string | null;
}

export interface UpsertFranchiseAgreementRequest {
  outletId: string;
  royaltyPercent: number;
  feeMonthly: number;
  allowPriceOverride?: boolean;
  startDate?: string;
  notes?: string | null;
}

export interface FranchiseRoyaltyStatementDto {
  id: string;
  agreementId: string;
  outletId: string;
  outletName: string;
  periodStart: string;
  periodEnd: string;
  grossSales: number;
  royaltyDue: number;
  feeDue: number;
  totalDue: number;
  status: "draft" | "issued" | "paid";
  issuedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface GenerateStatementsRequest {
  /** ISO date (YYYY-MM-DD). Defaults to the first day of last month. */
  periodStart?: string;
  /** ISO date, exclusive. Defaults to the first day of this month. */
  periodEnd?: string;
}

export interface GenerateStatementsResponse {
  created: number;
  updated: number;
  statements: FranchiseRoyaltyStatementDto[];
}

// ── Franchise — inter-tenant partners ───────────────────────────────────

export interface FranchiseePartnerDto {
  id: string;
  label: string | null;
  joinCode: string;
  status: "pending" | "active" | "ended";
  royaltyPercent: number;
  feeMonthly: number;
  franchiseeMerchantId: string | null;
  franchiseeName: string | null;
  joinedAt: string | null;
  createdAt: string;
  /** Franchisee's completed-sale revenue this calendar month (0 while pending). */
  revenueThisMonth: number;
}

export interface CreatePartnerInviteRequest {
  label?: string;
  royaltyPercent: number;
  feeMonthly: number;
}

export interface JoinFranchiseRequest {
  code: string;
}

export interface FranchiseePartnerStatementDto {
  id: string;
  partnerId: string;
  franchiseeMerchantId: string;
  franchiseeName: string | null;
  periodStart: string;
  periodEnd: string;
  grossSales: number;
  royaltyDue: number;
  feeDue: number;
  totalDue: number;
  status: "draft" | "issued" | "paid";
  issuedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

/** GET /api/franchise/membership — is this merchant somebody's franchisee? */
export interface FranchiseMembershipResponse {
  isFranchisee: boolean;
  franchisorName: string | null;
  status: "pending" | "active" | "ended" | null;
  royaltyPercent: number | null;
  feeMonthly: number | null;
  joinedAt: string | null;
  /** Statements the franchisor has raised against this merchant. */
  statements: FranchiseePartnerStatementDto[];
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

export interface WalletSummaryResponse {
  balance: number;
}

export interface WalletLedgerItem {
  id: string;
  type: "topup_credit" | "ppob_debit" | "ppob_refund" | "adjustment";
  amount: number;
  balanceAfter: number;
  reference: string;
  description: string;
  createdAt: string;
}

export interface WalletTopupResponse {
  id: string;
  amount: number;
  partnerRef: string;
  providerRef: string | null;
  qrContent: string;
  status: "pending" | "paid" | "expired" | "failed";
  expiresAt: string;
  paidAt: string | null;
  createdAt: string;
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
  skuCode?: string;
}

export interface PrepaidProduct {
  skuCode: string;
  name: string;
  category: string;
  brand: string;
  type: string;
  price: number;
  description: string;
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

export interface PpobProviderStatusResponse {
  provider: "mock" | "digiflazz";
  mode: "mock" | "development" | "production";
  configured: boolean;
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
