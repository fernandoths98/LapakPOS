const LOCALE = "id-ID";

/** "14:30" — 24-hour, which is how a shift log and a receipt are read. */
export function formatTimeOfDay(iso: string | Date): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toLocaleTimeString(LOCALE, { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** "Senin, 8 September" — the heading a shift opens under. */
export function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long" }).format(date);
}

/** "Sen" — compact enough for a bar chart axis or a "vs yesterday" line. */
export function formatWeekdayShort(date: Date): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: "short" }).format(date);
}
