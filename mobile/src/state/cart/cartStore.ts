import { create } from "zustand";
import { Product } from "@lapak/shared";

/**
 * Mirrors the prototype's `cart` state — a plain `Record<productId, qty>` —
 * but each line also snapshots the product's name/price at add time rather
 * than keying purely by id and re-reading the React Query product cache.
 * That keeps Cart/Paid rendering correct even if the product list has since
 * been refetched, filtered out of view, or (once catalog editing exists)
 * had its price changed — the cart should show what was actually added, not
 * whatever the catalog says right now. It costs a little duplication for a
 * lot of simplicity: Cart/Paid never need an extra product lookup.
 */
export interface CartLine {
  productId: string;
  name: string;
  unitPrice: number;
  /** Snapshot used to prevent a cashier increasing qty past available stock. */
  stockQty?: number;
  qty: number;
}

interface CartState {
  lines: Record<string, CartLine>;
  /** Adds one unit, matching the prototype's `add()` (increments if already present). */
  addItem: (product: Pick<Product, "id" | "name" | "sellPrice"> & { stockQty?: number }) => void;
  /** Adjusts qty by `delta`; the line is removed once qty reaches 0, matching `bump()`. */
  bump: (productId: string, delta: number) => void;
  clear: () => void;
}

export const useCartStore = create<CartState>((set) => ({
  lines: {},

  addItem: (product) =>
    set((state) => {
      const existing = state.lines[product.id];
      return {
        lines: {
          ...state.lines,
          [product.id]: existing
            ? { ...existing, qty: existing.qty + 1 }
            : {
                productId: product.id,
                name: product.name,
                unitPrice: product.sellPrice,
                ...(product.stockQty !== undefined ? { stockQty: product.stockQty } : {}),
                qty: 1,
              },
        },
      };
    }),

  bump: (productId, delta) =>
    set((state) => {
      const existing = state.lines[productId];
      if (!existing) return state;
      const nextQty = existing.qty + delta;
      if (delta > 0 && existing.stockQty !== undefined && nextQty > existing.stockQty) {
        return state;
      }
      if (nextQty <= 0) {
        const rest = { ...state.lines };
        delete rest[productId];
        return { lines: rest };
      }
      return { lines: { ...state.lines, [productId]: { ...existing, qty: nextQty } } };
    }),

  clear: () => set({ lines: {} }),
}));

export function cartLinesArray(lines: Record<string, CartLine>): CartLine[] {
  return Object.values(lines);
}

export function cartTotal(lines: Record<string, CartLine>): number {
  return Object.values(lines).reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
}

export function cartCount(lines: Record<string, CartLine>): number {
  return Object.values(lines).reduce((sum, line) => sum + line.qty, 0);
}
