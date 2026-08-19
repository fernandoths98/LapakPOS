import { MMKV } from "react-native-mmkv";
import { create } from "zustand";
import { CreateSaleRequest, Sale } from "@lapak/shared";

/**
 * Library choice — react-native-mmkv v3.x (not the current v4 line), same
 * kind of judgment call bluetoothPrinter/index.ts documents for its own
 * native dependency: v4 depends on `react-native-nitro-modules` (the newer
 * Nitro Modules native-module system), an extra native dependency this app
 * doesn't otherwise need. v3.x talks to MMKV directly over JSI with no
 * additional native package, which is the lower-risk shape for a sandbox
 * that can't actually build and verify either version on a real device.
 * v3.3.3 (npm, published 2026-06) is the most recent v3.x release.
 */
const storage = new MMKV({ id: "lapak-pending-sales" });
const STORAGE_KEY = "pendingSales.v1";

/**
 * One sale that was taken (cash collected, cart cleared) while the app
 * couldn't reach the server, waiting to be POSTed for real. `request` is
 * exactly the body that will be retried against POST /api/sales — same
 * `clientId` every time, which is what makes any number of retries safe
 * (see sales.ts / sales.service.ts's idempotency contract). `sale` is the
 * client-synthesized receipt data CartScreen already navigated Paid with;
 * kept here too so a future "pending sales" list screen could show it
 * without redoing that synthesis (no such screen exists yet — this phase
 * only needs the count, but storing the full receipt costs nothing extra
 * and keeps the queue record self-describing).
 */
export interface PendingSale {
  clientId: string;
  request: CreateSaleRequest;
  sale: Sale;
  enqueuedAt: string;
  attempts: number;
  lastError?: string;
}

function readAll(): PendingSale[] {
  const raw = storage.getString(STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingSale[]) : [];
  } catch {
    // Corrupt/unparseable storage should never crash the app — treat it as
    // an empty queue rather than throwing out of every call site.
    return [];
  }
}

interface PendingSalesState {
  items: PendingSale[];
}

/**
 * Zustand mirror of the MMKV-backed queue. MMKV is the durable source of
 * truth (survives app restarts); this store is a live in-memory cache of it
 * that every mutating function below keeps in lockstep, so React components
 * (SyncStatusBar) can subscribe with a plain selector and re-render
 * immediately on enqueue/remove/updateAttempt — no polling, no manual
 * refresh. Seeded once from disk at module load.
 */
export const usePendingSalesStore = create<PendingSalesState>(() => ({
  items: readAll(),
}));

function writeAll(items: PendingSale[]): void {
  storage.set(STORAGE_KEY, JSON.stringify(items));
  usePendingSalesStore.setState({ items });
}

/** Adds a new pending sale to the end of the queue (FIFO — syncManager flushes oldest first). */
export function enqueue(item: PendingSale): void {
  writeAll([...readAll(), item]);
}

/** All pending sales, oldest first. */
export function list(): PendingSale[] {
  return readAll();
}

/** Removes one pending sale (called once its retry succeeds, or the server confirms it already existed). */
export function remove(clientId: string): void {
  writeAll(readAll().filter((item) => item.clientId !== clientId));
}

/** Records a failed retry attempt against an existing pending sale — leaves it queued. */
export function updateAttempt(clientId: string, patch: { attempts: number; lastError?: string }): void {
  writeAll(
    readAll().map((item) =>
      item.clientId === clientId ? { ...item, attempts: patch.attempts, lastError: patch.lastError } : item,
    ),
  );
}

/** Number of sales currently waiting to sync. Convenience for non-React call sites; components should prefer the `usePendingSalesStore` selector so they re-render on change. */
export function pendingCount(): number {
  return readAll().length;
}
