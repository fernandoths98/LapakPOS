import { useEffect } from "react";
import { AppState } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import { Sale } from "@lapak/shared";
import { apiClient } from "../api/apiClient";
import { queryClient } from "../api/queryClient";
import { list, remove, updateAttempt, PendingSale } from "./pendingSalesQueue";

/**
 * Backoff schedule for retrying one pending sale: 5s after the 1st failure,
 * 15s after the 2nd, 30s after the 3rd, then capped at 60s for every
 * failure after that. Indexed by `attempts - 1` (attempts counts completed
 * failed tries). This throttles retries against a still-down connection —
 * it never stops them; per the idempotent-clientId design a merchant's sale
 * should never silently vanish, so there is no give-up/needs-review state
 * here, just a growing gap between tries.
 */
const BACKOFF_SCHEDULE_MS = [5_000, 15_000, 30_000];
const BACKOFF_CAP_MS = 60_000;

export function nextRetryDelayMs(attempts: number): number {
  if (attempts <= 0) return 0;
  const index = attempts - 1;
  return index < BACKOFF_SCHEDULE_MS.length ? BACKOFF_SCHEDULE_MS[index] : BACKOFF_CAP_MS;
}

/**
 * Pure decision function, deliberately extracted from `flushQueue` so the
 * backoff logic is unit-testable without a real timer, network, or MMKV:
 * given an item's failure count and when it was last attempted (`null` if
 * never), should it be retried right now? A fresh item (0 attempts) always
 * retries immediately.
 *
 * `lastAttemptAt` is intentionally NOT part of the persisted `PendingSale`
 * record — it's tracked only in `flushQueue`'s in-memory map (see below),
 * not written to MMKV. That's a deliberate simplification: backoff is a
 * soft, in-session throttle against hammering a still-down connection, not
 * a correctness guarantee. Losing it on app restart just means the next
 * flush retries immediately, which is harmless (retries are always safe)
 * and arguably right — an app cold-start is itself a reasonable moment to
 * try again.
 */
export function shouldRetryNow(item: Pick<PendingSale, "attempts">, lastAttemptAt: number | null, now: number): boolean {
  if (item.attempts <= 0 || lastAttemptAt === null) return true;
  return now - lastAttemptAt >= nextRetryDelayMs(item.attempts);
}

const lastAttemptAtByClientId = new Map<string, number>();

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

let flushInFlight = false;

/**
 * Retries every due pending sale, FIFO, against the same POST /api/sales +
 * clientId each one already has queued. Success removes it from the queue;
 * failure (network or, on a queued item, even a real 4xx — see CartScreen's
 * handlePay for why a *fresh* 4xx is never queued in the first place, but a
 * previously-network-failed sale getting a 4xx on retry, e.g. stock sold
 * out from under it while offline, still doesn't get silently dropped here)
 * just records the attempt and leaves it queued for a later, backed-off
 * retry. Product cache is invalidated once at the end if anything synced,
 * so real server-confirmed stock replaces CartScreen's earlier optimistic
 * patch.
 *
 * Re-entrancy guarded with a module-level flag — NetInfo, AppState, and the
 * interval can all fire close together, and overlapping flushes would just
 * duplicate in-flight POSTs for the same items.
 */
export async function flushQueue(): Promise<void> {
  if (flushInFlight) return;
  flushInFlight = true;
  try {
    const items = list();
    const now = Date.now();
    let syncedAny = false;

    for (const item of items) {
      const lastAttemptAt = lastAttemptAtByClientId.get(item.clientId) ?? null;
      if (!shouldRetryNow(item, lastAttemptAt, now)) continue;

      lastAttemptAtByClientId.set(item.clientId, now);
      try {
        await apiClient.post<Sale>("/api/sales", item.request);
        lastAttemptAtByClientId.delete(item.clientId);
        remove(item.clientId);
        syncedAny = true;
      } catch (err) {
        updateAttempt(item.clientId, { attempts: item.attempts + 1, lastError: errorMessage(err) });
      }
    }

    if (syncedAny) {
      queryClient.invalidateQueries({ queryKey: ["products"] });
    }
  } finally {
    flushInFlight = false;
  }
}

const FLUSH_INTERVAL_MS = 30_000;

/**
 * Wires up every trigger that should attempt a queue flush, mounted once
 * near the app root (App.tsx) rather than duplicated per-screen:
 *  - NetInfo transitioning from offline to online (the obvious moment).
 *  - The app coming to the foreground (AppState → "active") — a reasonable
 *    moment to try even if connectivity didn't visibly change.
 *  - A 30s interval while the app is active, as a backstop (e.g. the
 *    connection came back without NetInfo firing a clean transition, or a
 *    backed-off item's window has now elapsed).
 * Also fires once on mount so a cold start with a connection already up
 * flushes any sale left queued from a previous session immediately, rather
 * than waiting for the first trigger.
 */
export function useSyncManager(): void {
  useEffect(() => {
    let wasOffline = false;
    // flushQueue() already catches every per-item failure internally; this
    // guards only against something unexpected (e.g. reading the queue
    // itself throwing) so a bad tick can never surface as an unhandled
    // promise rejection.
    const triggerFlush = () => {
      flushQueue().catch(() => undefined);
    };

    triggerFlush();

    const netInfoSubscription = NetInfo.addEventListener((state) => {
      const isOnline = !!state.isConnected && state.isInternetReachable !== false;
      if (isOnline && wasOffline) {
        triggerFlush();
      }
      wasOffline = !isOnline;
    });

    const appStateSubscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        triggerFlush();
      }
    });

    const interval = setInterval(triggerFlush, FLUSH_INTERVAL_MS);
    // On-device, React Native's setInterval returns a plain number with no
    // unref() — this cast+optional-call is a no-op there, and only matters
    // in Jest/Node (App.test.tsx's smoke render), where the real Timeout
    // object's unref() keeps this interval from holding the test worker
    // process open after the test finishes.
    (interval as unknown as { unref?: () => void }).unref?.();

    return () => {
      netInfoSubscription();
      appStateSubscription.remove();
      clearInterval(interval);
    };
  }, []);
}
