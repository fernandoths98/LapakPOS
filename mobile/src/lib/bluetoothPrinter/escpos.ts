/**
 * A small, hand-rolled ESC/POS byte encoder. This is deliberately not a
 * dependency on a printer library's own "high level" print API — see the
 * README note in `index.ts` for why. Only the handful of control sequences
 * every cheap 58mm ESC/POS printer implements are used: initialize, bold
 * on/off, alignment, line feed, and full cut. These are standard and
 * well-documented (Epson's ESC/POS command reference, which the clones all
 * copy) — not something specific to any one printer brand.
 */
import { Buffer } from "buffer";
import { ReceiptLine } from "./receiptFormatting";

const ESC = 0x1b;
const GS = 0x1d;

const CMD = {
  init: Buffer.from([ESC, 0x40]),
  boldOn: Buffer.from([ESC, 0x45, 0x01]),
  boldOff: Buffer.from([ESC, 0x45, 0x00]),
  alignLeft: Buffer.from([ESC, 0x61, 0x00]),
  alignCenter: Buffer.from([ESC, 0x61, 0x01]),
  alignRight: Buffer.from([ESC, 0x61, 0x02]),
  lineFeed: Buffer.from([0x0a]),
  cut: Buffer.from([GS, 0x56, 0x00]),
} as const;

const ALIGN_CMD: Record<"left" | "center" | "right", Buffer> = {
  left: CMD.alignLeft,
  center: CMD.alignCenter,
  right: CMD.alignRight,
};

/**
 * Encodes formatted receipt lines into a single ESC/POS byte payload: init,
 * then each line with its alignment/bold control codes and a trailing line
 * feed, then a few blank feeds and a full cut so the receipt tears cleanly
 * clear of the printer's blade.
 */
export function buildEscPosPayload(lines: ReceiptLine[]): Buffer {
  const parts: Buffer[] = [CMD.init];
  let currentAlign: "left" | "center" | "right" = "left";

  for (const line of lines) {
    const align = line.align ?? "left";
    if (align !== currentAlign) {
      parts.push(ALIGN_CMD[align]);
      currentAlign = align;
    }
    if (line.bold) parts.push(CMD.boldOn);
    parts.push(Buffer.from(line.text, "utf-8"));
    if (line.bold) parts.push(CMD.boldOff);
    parts.push(CMD.lineFeed);
  }

  parts.push(CMD.lineFeed, CMD.lineFeed, CMD.lineFeed, CMD.cut);
  return Buffer.concat(parts);
}
