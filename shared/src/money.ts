/** Formats a number of Rupiah as "Rp 1.234.567" — ported exactly from the prototype's RP() helper. */
export function formatRupiah(amount: number): string {
  return "Rp " + Math.round(amount).toLocaleString("id-ID");
}

/** Parses a "Rp 1.234.567" / "1.234.567" / "1234567" string back into a number. */
export function parseRupiah(input: string): number {
  const digits = input.replace(/[^0-9]/g, "");
  return digits === "" ? 0 : parseInt(digits, 10);
}
