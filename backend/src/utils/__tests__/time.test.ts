import { DEFAULT_TIMEZONE, dayBoundsForKey, dayBoundsInTz, hourInTz, localDateKey, tzOffsetMs } from "../time";

const iso = (d: Date) => d.toISOString();

describe("time (timezone-aware calendar days)", () => {
  it("DEFAULT_TIMEZONE is WIB", () => {
    expect(DEFAULT_TIMEZONE).toBe("Asia/Jakarta");
  });

  describe("tzOffsetMs", () => {
    it("is +7h for WIB, +8h for WITA, +9h for WIT (no DST in Indonesia)", () => {
      const at = new Date("2026-08-27T12:00:00Z");
      expect(tzOffsetMs(at, "Asia/Jakarta")).toBe(7 * 3_600_000);
      expect(tzOffsetMs(at, "Asia/Makassar")).toBe(8 * 3_600_000);
      expect(tzOffsetMs(at, "Asia/Jayapura")).toBe(9 * 3_600_000);
    });
  });

  describe("localDateKey", () => {
    it("rolls the date forward once the instant crosses local midnight", () => {
      // 23:30 UTC on the 27th is already 06:30 on the 28th in WIB.
      const at = new Date("2026-08-27T23:30:00Z");
      expect(localDateKey(at, "Asia/Jakarta")).toBe("2026-08-28");
      // ...but still the 27th in UTC.
      expect(at.toISOString().slice(0, 10)).toBe("2026-08-27");
    });

    it("defaults to WIB", () => {
      const at = new Date("2026-08-27T20:00:00Z"); // 03:00 WIB next day
      expect(localDateKey(at)).toBe("2026-08-28");
    });
  });

  describe("dayBoundsForKey / dayBoundsInTz", () => {
    it("spans local midnight-to-midnight as UTC instants (WIB)", () => {
      const { start, end } = dayBoundsForKey("2026-08-28", "Asia/Jakarta");
      expect(iso(start)).toBe("2026-08-27T17:00:00.000Z");
      expect(iso(end)).toBe("2026-08-28T17:00:00.000Z");
    });

    it("spans a full 24h", () => {
      const { start, end } = dayBoundsForKey("2026-08-28", "Asia/Makassar");
      expect(end.getTime() - start.getTime()).toBe(24 * 3_600_000);
      expect(iso(start)).toBe("2026-08-27T16:00:00.000Z");
    });

    it("buckets an early-morning-local sale into the local day, not the UTC day", () => {
      // 22:00 UTC Aug 28 == 05:00 WIB Aug 29.
      const sale = new Date("2026-08-28T22:00:00Z");
      const { start, end } = dayBoundsInTz(sale, "Asia/Jakarta");
      expect(sale >= start && sale < end).toBe(true);
      expect(localDateKey(start, "Asia/Jakarta")).toBe("2026-08-29");
    });

    it("the previous local day ends exactly where the current one starts", () => {
      const today = dayBoundsInTz(new Date("2026-08-28T10:00:00Z"), "Asia/Jakarta");
      const yesterday = dayBoundsInTz(new Date(today.start.getTime() - 1), "Asia/Jakarta");
      expect(iso(yesterday.end)).toBe(iso(today.start));
      expect(yesterday.end.getTime() - yesterday.start.getTime()).toBe(24 * 3_600_000);
    });
  });

  describe("hourInTz", () => {
    it("returns the local hour-of-day, shifting with the zone", () => {
      const at = new Date("2026-08-27T18:30:00Z");
      expect(hourInTz(at, "Asia/Jakarta")).toBe(1); // 01:30 WIB
      expect(hourInTz(at, "Asia/Makassar")).toBe(2); // 02:30 WITA
      expect(hourInTz(at, "Asia/Jayapura")).toBe(3); // 03:30 WIT
    });
  });
});
