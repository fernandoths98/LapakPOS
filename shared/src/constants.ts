export const LOW_STOCK_THRESHOLD_DEFAULT = 8;

export const TENDER_TYPES = ["cash", "qris", "debit", "split"] as const;
export type TenderType = (typeof TENDER_TYPES)[number];

export const USER_ROLES = ["owner", "manager", "cashier", "stocker"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const BUSINESS_TYPES = ["retail", "restaurant"] as const;
export type BusinessType = (typeof BUSINESS_TYPES)[number];

/** The three Indonesian timezones an outlet may keep its calendar days in. WIB is the default. */
export const OUTLET_TIMEZONES = ["Asia/Jakarta", "Asia/Makassar", "Asia/Jayapura"] as const;
export type OutletTimezone = (typeof OUTLET_TIMEZONES)[number];
export const DEFAULT_OUTLET_TIMEZONE: OutletTimezone = "Asia/Jakarta";

export const PLAN_CODES = ["free", "starter", "growth", "pro"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const SUBSCRIPTION_STATUSES = ["trialing", "active", "past_due", "canceled"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const PPOB_CATEGORIES = [
  "electricity",
  "mobile",
  "water",
  "health_insurance",
  "ewallet",
  "internet_tv",
  "games",
  "tv_voucher",
  "gas",
] as const;
export type PpobCategory = (typeof PPOB_CATEGORIES)[number];

export const SALE_STATUSES = ["completed", "voided"] as const;
export type SaleStatus = (typeof SALE_STATUSES)[number];

export const SHIFT_STATUSES = ["open", "closed"] as const;
export type ShiftStatus = (typeof SHIFT_STATUSES)[number];

export const PPOB_TRANSACTION_STATUSES = ["pending", "success", "failed"] as const;
export type PpobTransactionStatus = (typeof PPOB_TRANSACTION_STATUSES)[number];

export const RECAP_KINDS = ["daily_story", "ask_context"] as const;
export type RecapKind = (typeof RECAP_KINDS)[number];

export const EXPENSE_SOURCES = ["manual", "ai_photo"] as const;
export type ExpenseSource = (typeof EXPENSE_SOURCES)[number];
