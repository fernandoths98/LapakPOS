/**
 * Pure, UI-framework-free formatting of receipt/Z-report content for a 58mm
 * ESC/POS thermal printer. No React Native or native-module imports here —
 * this file is plain TypeScript so it can be unit tested directly in Jest
 * without any Bluetooth hardware or mocking.
 *
 * 58mm thermal paper prints roughly 32 characters per line at the printer's
 * normal (font A, not condensed) size — the same width assumption the
 * prototype's monospace receipt preview uses.
 */
import { Sale, ZReportResponse, formatRupiah } from "@lapak/shared";

export const RECEIPT_WIDTH = 32;

/** One line of receipt content, in print order. `align`/`bold` map directly onto ESC/POS control codes. */
export interface ReceiptLine {
  text: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
}

/** Truncates to at most `maxLen` characters — never wraps, matching the prototype's `.slice()` truncation of long product names. */
export function truncate(text: string, maxLen: number): string {
  if (maxLen <= 0) return "";
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

/**
 * Lays a label/value pair across the line width, label left-aligned and
 * value right-aligned — e.g. `"1x Kopi Susu Gula Aren    Rp 18.000"`. The
 * label is truncated (never wrapped) if the value doesn't leave it room,
 * mirroring the prototype receipt's `overflow:hidden;text-overflow:ellipsis`
 * treatment of long product names against a fixed-width right column.
 */
export function formatRow(left: string, right: string, width: number = RECEIPT_WIDTH): string {
  const safeRight = truncate(right, width);
  const gap = safeRight.length > 0 ? 1 : 0;
  const availableLeft = Math.max(0, width - safeRight.length - gap);
  const safeLeft = truncate(left, availableLeft).padEnd(availableLeft, " ");
  return gap > 0 ? `${safeLeft} ${safeRight}` : safeLeft;
}

/** Centers text within the line width, matching the receipt's centered merchant header/footer. */
export function centerText(text: string, width: number = RECEIPT_WIDTH): string {
  const safe = truncate(text, width);
  const totalPad = width - safe.length;
  const left = Math.floor(totalPad / 2);
  return " ".repeat(left) + safe;
}

/** A full-width dashed rule, matching the receipt preview's `border-top:1px dashed`. */
export function dashedRule(width: number = RECEIPT_WIDTH): string {
  return "-".repeat(width);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export interface ReceiptMerchantInfo {
  name: string;
  addressLine: string;
}

/**
 * Builds the printable receipt content for a completed sale — merchant
 * header, two rows per line item (product name, then quantity × unit price
 * with the line subtotal), tender, TOTAL, and the
 * "Terima kasih" footer. Mirrors `receiptLines`/`isPaid` in the prototype
 * (Warung POS.dc.html) and the on-screen receipt in PaidScreen.tsx exactly,
 * just re-rendered for a monospace 32-column printer instead of a phone
 * screen.
 */
export function buildSaleReceiptLines(sale: Sale, tenderLabel: string, merchant: ReceiptMerchantInfo): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  lines.push({ text: truncate(merchant.name.toUpperCase(), RECEIPT_WIDTH), align: "center", bold: true });
  lines.push({ text: truncate(merchant.addressLine, RECEIPT_WIDTH), align: "center" });
  lines.push({ text: dashedRule() });
  for (const item of sale.lineItems) {
    lines.push({ text: truncate(item.productName, RECEIPT_WIDTH) });
    lines.push({ text: formatRow(`  ${item.qty} x ${formatRupiah(item.unitPrice)}`, formatRupiah(item.lineTotal)) });
  }
  lines.push({ text: formatRow("Tender", tenderLabel) });
  lines.push({ text: dashedRule() });
  lines.push({ text: formatRow("TOTAL", formatRupiah(sale.total)), bold: true });
  lines.push({ text: truncate("Terima kasih - Kotdee POS", RECEIPT_WIDTH), align: "center" });
  return lines;
}

/**
 * Builds the printable Z-report content for a shift close — shift open/close
 * times, cashier name, the same five running-total rows shown on
 * ShiftCloseScreen (Opening float / Cash sales / PPOB cash in / Paid out /
 * Expected in drawer), and counted-cash + discrepancy once the shift has
 * actually been closed.
 */
export function buildZReportLines(report: ZReportResponse, merchantName: string): ReceiptLine[] {
  const { shift, running, discrepancy } = report;
  const lines: ReceiptLine[] = [];
  lines.push({ text: truncate(merchantName.toUpperCase(), RECEIPT_WIDTH), align: "center", bold: true });
  lines.push({ text: "Z-REPORT", align: "center" });
  lines.push({ text: dashedRule() });
  lines.push({ text: formatRow("Opened", formatTime(shift.openedAt)) });
  if (shift.closedAt) {
    lines.push({ text: formatRow("Closed", formatTime(shift.closedAt)) });
  }
  lines.push({ text: formatRow("Cashier", shift.userName) });
  lines.push({ text: dashedRule() });
  lines.push({ text: formatRow("Opening float", formatRupiah(running.openingFloat)) });
  lines.push({ text: formatRow("Cash sales", formatRupiah(running.cashSales)) });
  lines.push({ text: formatRow("PPOB cash in", formatRupiah(running.ppobCashIn)) });
  lines.push({ text: formatRow("Paid out", `- ${formatRupiah(running.paidOut)}`) });
  lines.push({ text: dashedRule() });
  lines.push({ text: formatRow("Expected in drawer", formatRupiah(running.expectedCash)), bold: true });
  if (shift.countedCash != null) {
    lines.push({ text: formatRow("Counted in drawer", formatRupiah(shift.countedCash)) });
  }
  if (discrepancy != null) {
    const label = discrepancy === 0 ? "Balanced" : discrepancy > 0 ? "Over by" : "Short by";
    lines.push({ text: formatRow(label, formatRupiah(Math.abs(discrepancy))) });
  }
  lines.push({ text: dashedRule() });
  lines.push({ text: truncate("Terima kasih - Kotdee POS", RECEIPT_WIDTH), align: "center" });
  return lines;
}

/** Renders `ReceiptLine[]` back to plain text (one line per entry) — used by unit tests and by the print sheet's on-screen preview. */
export function receiptLinesToPlainText(lines: ReceiptLine[]): string {
  return lines.map((l) => l.text).join("\n");
}
