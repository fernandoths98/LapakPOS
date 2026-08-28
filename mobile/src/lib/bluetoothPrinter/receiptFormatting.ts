/**
 * Pure, UI-framework-free formatting of receipt/Z-report content for a 58mm
 * ESC/POS thermal printer. No React Native or native-module imports here —
 * this file is plain TypeScript so it can be unit tested directly in Jest
 * without any Bluetooth hardware or mocking.
 *
 * 58mm thermal paper prints roughly 32 characters per line at the printer's
 * normal (font A, not condensed) size. The on-screen preview in
 * PaidScreen.tsx renders the exact same `ReceiptLine[]` in a monospace font,
 * so what the cashier sees is what prints.
 */
import { Sale, ZReportResponse, formatRupiah } from "@lapak/shared";

export const RECEIPT_WIDTH = 32;

/** One line of receipt content, in print order. `align`/`bold` map directly onto ESC/POS control codes. */
export interface ReceiptLine {
  text: string;
  align?: "left" | "center" | "right";
  bold?: boolean;
}

/** Truncates to at most `maxLen` characters — never wraps, matching the prototype's `.slice()` truncation of long product names. Coerces nullish/non-string input to "" (an older backend may not send every field yet). */
export function truncate(text: string, maxLen: number): string {
  const s = typeof text === "string" ? text : String(text ?? "");
  if (maxLen <= 0) return "";
  return s.length > maxLen ? s.slice(0, maxLen) : s;
}

/**
 * Word-wraps `text` into lines no wider than `width`. A single word longer
 * than the line is hard-split. Used for the merchant address block in the
 * header, which should flow onto as many centered lines as it needs rather
 * than being cut off.
 */
export function wrapText(text: string, width: number = RECEIPT_WIDTH): string[] {
  const words = String(text ?? "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > width) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let i = 0; i < word.length; i += width) lines.push(word.slice(i, i + width));
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

/**
 * Lays a label/value pair across the line width, label left-aligned and
 * value right-aligned — e.g. `"1x Kopi Susu Gula Aren    Rp 18.000"`. The
 * label is truncated (never wrapped) if the value doesn't leave it room.
 * An empty `left` right-aligns `right` on its own line.
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

/** `YYYY-MM-DD` in the device's local time — the format on the sample warung receipts. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `HH:MM:SS`, 24h, device-local. */
function formatClock(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export interface ReceiptMerchantInfo {
  name: string;
  address: string | null;
  phone: string | null;
}

export interface ReceiptOutletInfo {
  name: string;
  address: string | null;
}

export interface SaleReceiptContext {
  tenderLabel: string;
  /** Name of the cashier who rang the sale, printed opposite the date. */
  cashierName: string;
  merchant: ReceiptMerchantInfo;
  /** The outlet the sale was rung at — printed as its own line when the merchant has more than the one. */
  outlet: ReceiptOutletInfo | null;
  /** For a cash sale: what the customer handed over and the change given back. */
  cashReceived?: number;
  change?: number;
}

/**
 * Builds the printable receipt for a completed sale in the layout Indonesian
 * warung customers expect:
 *
 *   - centered merchant block (name, wrapped address, phone) + a receipt
 *     reference number
 *   - date + time on the left, cashier on the right, then the outlet line
 *   - `No.<orderNo>`
 *   - numbered line items: bold name, then `<qty> x <unit price>` with the
 *     line subtotal right-aligned
 *   - `Total QTY`, then Sub Total / (Diskon) / **Total** / `Bayar (<tender>)`
 *     / `Kembali`
 *   - centered "Terimakasih Telah Berbelanja"
 */
export function buildSaleReceiptLines(sale: Sale, ctx: SaleReceiptContext): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  // Raw text + `align: "center"` — the ESC/POS printer does the centering
  // (via ESC a 1), which is correct whatever the printer's real column count
  // is. Baking in spaces with centerText() *and* asking the printer to
  // center double-shifts the text to the right, which is the "header not
  // centered on the printout" bug.
  const center = (text: string, bold = false): ReceiptLine => ({ text: truncate(text, RECEIPT_WIDTH), align: "center", bold });

  // ── Header ──────────────────────────────────────────────────────────────
  lines.push(center(ctx.merchant.name.toUpperCase(), true));
  if (ctx.merchant.address) {
    for (const addressLine of wrapText(ctx.merchant.address)) lines.push(center(addressLine));
  }
  if (ctx.merchant.phone) lines.push(center(`No. Telp ${ctx.merchant.phone}`));
  lines.push(center(`No. Struk ${formatDate(sale.createdAt).replace(/-/g, "")}${formatClock(sale.createdAt).replace(/:/g, "")}-${sale.orderNo}`));

  // ── Transaction meta ────────────────────────────────────────────────────
  lines.push({ text: dashedRule() });
  lines.push({ text: formatRow(formatDate(sale.createdAt), ctx.cashierName) });
  lines.push({ text: formatClock(sale.createdAt) });
  if (ctx.outlet && (ctx.outlet.address || ctx.outlet.name)) {
    lines.push({ text: formatRow("", ctx.outlet.address ?? ctx.outlet.name) });
  }
  lines.push({ text: `No.${sale.orderNo}` });

  // ── Items ───────────────────────────────────────────────────────────────
  lines.push({ text: dashedRule() });
  sale.lineItems.forEach((item, index) => {
    lines.push({ text: truncate(`${index + 1}. ${item.productName}`, RECEIPT_WIDTH), bold: true });
    lines.push({ text: formatRow(`   ${item.qty} x ${formatRupiah(item.unitPrice)}`, formatRupiah(item.lineTotal)) });
  });

  // ── Totals ──────────────────────────────────────────────────────────────
  lines.push({ text: dashedRule() });
  const totalQty = sale.lineItems.reduce((sum, item) => sum + item.qty, 0);
  lines.push({ text: `Total QTY : ${totalQty}` });
  lines.push({ text: "" });
  lines.push({ text: formatRow("Sub Total", formatRupiah(sale.subtotal)) });
  if (sale.discount > 0) {
    lines.push({ text: formatRow("Diskon", `- ${formatRupiah(sale.discount)}`) });
  }
  lines.push({ text: formatRow("Total", formatRupiah(sale.total)), bold: true });

  const paid = ctx.cashReceived ?? sale.total;
  lines.push({ text: formatRow(`Bayar (${ctx.tenderLabel})`, formatRupiah(paid)) });
  lines.push({ text: formatRow("Kembali", formatRupiah(ctx.change ?? 0)) });

  // ── Footer ──────────────────────────────────────────────────────────────
  lines.push({ text: "" });
  lines.push(center("Terimakasih Telah Berbelanja"));
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
