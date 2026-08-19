import { nextRetryDelayMs, shouldRetryNow } from '../syncManager';

describe('nextRetryDelayMs', () => {
  it('is immediate for a never-attempted item', () => {
    expect(nextRetryDelayMs(0)).toBe(0);
  });

  it('follows the 5s / 15s / 30s schedule for the first three failures', () => {
    expect(nextRetryDelayMs(1)).toBe(5_000);
    expect(nextRetryDelayMs(2)).toBe(15_000);
    expect(nextRetryDelayMs(3)).toBe(30_000);
  });

  it('caps at 60s from the fourth failure onward', () => {
    expect(nextRetryDelayMs(4)).toBe(60_000);
    expect(nextRetryDelayMs(5)).toBe(60_000);
    expect(nextRetryDelayMs(50)).toBe(60_000);
  });
});

describe('shouldRetryNow', () => {
  const NOW = 1_000_000;

  it('always retries a fresh item (0 attempts), regardless of lastAttemptAt', () => {
    expect(shouldRetryNow({ attempts: 0 }, null, NOW)).toBe(true);
    expect(shouldRetryNow({ attempts: 0 }, NOW - 1, NOW)).toBe(true);
  });

  it('retries immediately if there is no recorded last-attempt time, even with attempts > 0', () => {
    // e.g. right after an app restart, where the in-memory backoff map was
    // lost — see syncManager.ts's comment on why that's an intentional,
    // harmless simplification.
    expect(shouldRetryNow({ attempts: 3 }, null, NOW)).toBe(true);
  });

  it('withholds a retry before its backoff window has elapsed', () => {
    // 1 failed attempt -> 5s window
    expect(shouldRetryNow({ attempts: 1 }, NOW - 1_000, NOW)).toBe(false);
    expect(shouldRetryNow({ attempts: 1 }, NOW - 4_999, NOW)).toBe(false);
  });

  it('allows a retry once its backoff window has elapsed, at the boundary', () => {
    expect(shouldRetryNow({ attempts: 1 }, NOW - 5_000, NOW)).toBe(true);
    expect(shouldRetryNow({ attempts: 1 }, NOW - 10_000, NOW)).toBe(true);
  });

  it('uses the growing window for later attempts', () => {
    expect(shouldRetryNow({ attempts: 2 }, NOW - 10_000, NOW)).toBe(false);
    expect(shouldRetryNow({ attempts: 2 }, NOW - 15_000, NOW)).toBe(true);

    expect(shouldRetryNow({ attempts: 3 }, NOW - 29_999, NOW)).toBe(false);
    expect(shouldRetryNow({ attempts: 3 }, NOW - 30_000, NOW)).toBe(true);
  });

  it('caps the window at 60s no matter how many times it has failed', () => {
    expect(shouldRetryNow({ attempts: 20 }, NOW - 59_999, NOW)).toBe(false);
    expect(shouldRetryNow({ attempts: 20 }, NOW - 60_000, NOW)).toBe(true);
  });
});
