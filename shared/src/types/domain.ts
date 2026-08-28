import {
  ExpenseSource,
  PpobCategory,
  PpobTransactionStatus,
  RecapKind,
  SaleStatus,
  ShiftStatus,
  TenderType,
  UserRole,
} from "../constants";

export interface Merchant {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  defaultPrinterName: string | null;
  createdAt: string;
}

export interface User {
  id: string;
  merchantId: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt: string;
}

export interface Category {
  id: string;
  merchantId: string;
  name: string;
  sortOrder: number;
}

export interface Product {
  id: string;
  merchantId: string;
  categoryId: string | null;
  categoryName: string | null;
  name: string;
  barcode: string | null;
  sellPrice: number;
  costPrice: number;
  stockQty: number;
  lowStockThreshold: number;
  imageUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCostHistoryEntry {
  id: string;
  productId: string;
  oldCost: number;
  newCost: number;
  changedAt: string;
}

export interface Shift {
  id: string;
  merchantId: string;
  outletId: string;
  userId: string;
  userName: string;
  openedAt: string;
  closedAt: string | null;
  openingFloat: number;
  countedCash: number | null;
  expectedCash: number | null;
  status: ShiftStatus;
}

export interface SaleLineItem {
  id: string;
  productId: string;
  productName: string;
  unitPrice: number;
  qty: number;
  lineTotal: number;
}

export interface Sale {
  id: string;
  merchantId: string;
  outletId: string;
  shiftId: string;
  orderNo: string;
  clientId: string;
  tenderType: TenderType;
  cashAmount: number;
  qrisAmount: number;
  subtotal: number;
  discount: number;
  total: number;
  status: SaleStatus;
  createdAt: string;
  createdOffline: boolean;
  lineItems: SaleLineItem[];
}

export interface Expense {
  id: string;
  merchantId: string;
  outletId: string;
  shiftId: string | null;
  amount: number;
  note: string | null;
  photoUrl: string | null;
  source: ExpenseSource;
  createdAt: string;
}

export interface PpobBiller {
  id: string;
  merchantId: string;
  code: string;
  name: string;
  sub: string;
  category: PpobCategory;
  marginAmount: number;
  isActive: boolean;
}

export interface PpobTransaction {
  id: string;
  merchantId: string;
  outletId: string;
  billerId: string;
  billerName: string;
  shiftId: string;
  customerNumber: string;
  customerName: string;
  billAmount: number;
  adminFee: number;
  marginAmount: number;
  totalCharged: number;
  providerRef: string;
  status: PpobTransactionStatus;
  createdAt: string;
}

export interface AiRecapCacheEntry {
  id: string;
  merchantId: string;
  recapDate: string;
  kind: RecapKind;
  responseJson: unknown;
  model: string;
  createdAt: string;
}

export interface AiChatMessage {
  id: string;
  merchantId: string;
  userId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}
