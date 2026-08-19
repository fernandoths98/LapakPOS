import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { CreateSaleRequest, formatRupiah, GetCurrentShiftResponse, Product, Sale, TenderType } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { Slider } from "../../components/Slider";
import { colors, radius, space } from "../../theme/tokens";
import { CartLine, cartLinesArray, cartTotal, useCartStore } from "../../state/cart/cartStore";
import { generateClientId, useCreateSale } from "../../state/api/sales";
import { useCurrentShift } from "../../state/api/shifts";
import { enqueue } from "../../state/offline/pendingSalesQueue";
import { SellStackParamList } from "../../app/stacks/SellStack";

/** Attempt timeout for the live checkout POST — short on purpose: this is the
 * bound on how long the cashier waits before Lapak decides the network is
 * down and falls back to the offline queue, not a "give the server time"
 * timeout (that's `apiClient`'s global 15s, still used for every other
 * call). Passed as a per-request override so it doesn't change that
 * default. */
const CHECKOUT_TIMEOUT_MS = 6_000;

type TenderLabel = "Cash" | "QRIS" | "Debit card" | "Split";
const TENDER_OPTIONS: TenderLabel[] = ["Cash", "QRIS", "Debit card", "Split"];
const TENDER_TYPE_BY_LABEL: Record<TenderLabel, TenderType> = {
  Cash: "cash",
  QRIS: "qris",
  "Debit card": "debit",
  Split: "split",
};

export function CartScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SellStackParamList>>();
  const queryClient = useQueryClient();
  const lines = useCartStore((s) => s.lines);
  const bump = useCartStore((s) => s.bump);
  const [tender, setTender] = useState<TenderLabel | null>(null);
  const [splitPct, setSplitPct] = useState(60);
  const createSale = useCreateSale();
  const { data: currentShift } = useCurrentShift();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const cartLines = cartLinesArray(lines);
  const total = cartTotal(lines);

  // Derive the QRIS remainder from the rounded cash figure (rather than
  // rounding both independently, as the prototype's display-only math
  // does) so cashAmount + qrisAmount always sums to exactly `total` — the
  // backend rejects a split sale where it doesn't.
  const splitCash = Math.round((total * splitPct) / 100);
  const splitQris = total - splitCash;

  const canPay = cartLines.length > 0 && tender !== null && !createSale.isPending;

  const handlePay = async () => {
    if (!tender) return;
    setSubmitError(null);
    const tenderType = TENDER_TYPE_BY_LABEL[tender];
    const { cashAmount, qrisAmount } = amountsForTender(tenderType, total, splitCash, splitQris);
    const clientId = generateClientId();
    const body: CreateSaleRequest = {
      clientId,
      lineItems: cartLines.map((line) => ({ productId: line.productId, qty: line.qty })),
      tenderType,
      cashAmount,
      qrisAmount,
    };

    try {
      const sale = await createSale.mutateAsync({ body, timeoutMs: CHECKOUT_TIMEOUT_MS });
      navigation.navigate("Paid", { sale });
    } catch (err) {
      // Genuine network/timeout failure (the request never got a response
      // from the server — either it timed out, per CHECKOUT_TIMEOUT_MS
      // above, or a connectivity error fired before one arrived) vs. a real
      // business-rule rejection (the server responded, just with a 4xx —
      // insufficient stock, bad tender math, etc). Only the former is safe
      // to queue: it's silent to the cashier whether the sale ever reached
      // the server, so retrying with the same clientId is exactly what the
      // idempotency contract is for. A 4xx is a real error the cashier must
      // see and fix now — queuing it would either lose it silently or retry
      // something that's guaranteed to fail again the same way.
      if (axios.isAxiosError(err) && !err.response) {
        const offlineSale = buildOfflineSale({ clientId, cartLines, tenderType, cashAmount, qrisAmount, total, currentShift });
        enqueue({ clientId, request: body, sale: offlineSale, enqueuedAt: offlineSale.createdAt, attempts: 0 });
        patchProductStockCache(queryClient, cartLines);
        navigation.navigate("Paid", { sale: offlineSale });
        return;
      }
      setSubmitError("Payment didn't go through. Check your connection and try again.");
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.lines}>
        {cartLines.map((line) => (
          <View key={line.productId} style={styles.line}>
            <View style={styles.lineInfo}>
              <Text variant="body">{line.name}</Text>
              <Text variant="caption">{formatRupiah(line.unitPrice)} each</Text>
            </View>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => bump(line.productId, -1)}
                style={styles.stepperButton}
                accessibilityRole="button"
                accessibilityLabel={`Decrease ${line.name}`}
              >
                <Text variant="h3">−</Text>
              </Pressable>
              <Text variant="tabular" style={styles.stepperQty}>
                {line.qty}
              </Text>
              <Pressable
                onPress={() => bump(line.productId, 1)}
                style={styles.stepperButton}
                accessibilityRole="button"
                accessibilityLabel={`Increase ${line.name}`}
              >
                <Text variant="h3">+</Text>
              </Pressable>
            </View>
            <Text variant="tabular" style={styles.lineTotal}>
              {formatRupiah(line.unitPrice * line.qty)}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.summary}>
        <SummaryRow label="Subtotal" value={formatRupiah(total)} />
        <SummaryRow label="Discount" value="—" />
        <View style={styles.totalRow}>
          <Text variant="kicker">Total</Text>
          <Text variant="h1" style={styles.totalValue}>
            {formatRupiah(total)}
          </Text>
        </View>
      </View>

      <Text variant="kicker" style={styles.sectionLabel}>
        Tender
      </Text>
      <View style={styles.tenderGrid}>
        {TENDER_OPTIONS.map((option) => (
          <TenderPill key={option} label={option} active={tender === option} onPress={() => setTender(option)} />
        ))}
      </View>

      {tender === "Split" ? (
        <View style={styles.splitCard}>
          <SummaryRow label="Cash received" value={formatRupiah(splitCash)} />
          <SummaryRow label="QRIS remainder" value={formatRupiah(splitQris)} valueColor={colors.accent700} />
          <Slider
            minimumValue={0}
            maximumValue={100}
            step={1}
            value={splitPct}
            onValueChange={setSplitPct}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.divider}
            thumbTintColor={colors.accent}
            style={styles.slider}
          />
        </View>
      ) : null}

      {submitError ? (
        <Text variant="caption" color={colors.accent700} style={styles.error}>
          {submitError}
        </Text>
      ) : null}

      <Button
        title={createSale.isPending ? "Taking payment…" : `Take payment · ${formatRupiah(total)}`}
        onPress={handlePay}
        disabled={!canPay}
        loading={createSale.isPending}
        fullWidth
        style={styles.payButton}
      />
    </ScrollView>
  );
}

interface OfflineSaleParams {
  clientId: string;
  cartLines: CartLine[];
  tenderType: TenderType;
  cashAmount: number;
  qrisAmount: number;
  total: number;
  currentShift: GetCurrentShiftResponse | undefined;
}

/**
 * Synthesizes a client-side `Sale` for the offline path — same shape
 * `sales.service.ts` would compute server-side, built from data already on
 * hand in the cart, so PaidScreen can render it with zero changes and the
 * cashier's flow isn't interrupted by being offline. Placeholder choices,
 * all replaced with the server's real values once syncManager's retry
 * lands:
 *  - `id`: `"local-" + clientId` — clearly not a server id, but unique and
 *    stable for this attempt (React keys, navigation params).
 *  - `orderNo`: `"Queued"` — an honest placeholder rather than a fabricated
 *    number; the real sequential order number only exists once the server
 *    creates the row.
 *  - `merchantId`/`shiftId`: the currently-open shift's, if the shift query
 *    still has cached data (the common case — a shift is normally opened
 *    while online, before the app ever goes offline); `"offline"` otherwise.
 *    Neither is rendered anywhere in PaidScreen/the receipt, so this is a
 *    low-stakes placeholder, not a correctness-sensitive one.
 *  - `status: "completed"` — the sale genuinely happened, cash was
 *    collected, stock left the shelf; it isn't pending in the business
 *    sense, only in the sync sense (`createdOffline: true` carries that).
 */
function buildOfflineSale({
  clientId,
  cartLines,
  tenderType,
  cashAmount,
  qrisAmount,
  total,
  currentShift,
}: OfflineSaleParams): Sale {
  const createdAt = new Date().toISOString();
  const shift = currentShift?.shift;
  return {
    id: `local-${clientId}`,
    merchantId: shift?.merchantId ?? "offline",
    shiftId: shift?.id ?? "offline",
    orderNo: "Queued",
    clientId,
    tenderType,
    cashAmount,
    qrisAmount,
    subtotal: total,
    discount: 0,
    total,
    status: "completed",
    createdAt,
    createdOffline: true,
    lineItems: cartLines.map((line) => ({
      id: `local-${clientId}-${line.productId}`,
      productId: line.productId,
      productName: line.name,
      unitPrice: line.unitPrice,
      qty: line.qty,
      lineTotal: line.unitPrice * line.qty,
    })),
  };
}

/**
 * Optimistically decrements stock in the cached product list so the Sell
 * screen doesn't keep showing pre-sale stock until syncManager's retry
 * actually lands and invalidates `["products"]` for real. Patches every
 * cached `["products", ...]` query (React Query's default fuzzy match on a
 * partial key) in place; doesn't attempt to handle every possible cache
 * shape (e.g. an in-flight query not yet settled) — a best-effort reduction
 * of obvious staleness, not a source of truth. The real stock figure always
 * wins once the sale actually syncs.
 */
function patchProductStockCache(queryClient: QueryClient, cartLines: CartLine[]): void {
  const soldQtyByProductId = new Map(cartLines.map((line) => [line.productId, line.qty]));
  queryClient.setQueriesData<Product[]>({ queryKey: ["products"] }, (products) => {
    if (!products) return products;
    return products.map((product) => {
      const soldQty = soldQtyByProductId.get(product.id);
      return soldQty ? { ...product, stockQty: Math.max(0, product.stockQty - soldQty) } : product;
    });
  });
}

function amountsForTender(
  tenderType: TenderType,
  total: number,
  splitCash: number,
  splitQris: number,
): { cashAmount: number; qrisAmount: number } {
  switch (tenderType) {
    case "cash":
      return { cashAmount: total, qrisAmount: 0 };
    case "qris":
      return { cashAmount: 0, qrisAmount: total };
    case "debit":
      return { cashAmount: 0, qrisAmount: 0 };
    case "split":
      return { cashAmount: splitCash, qrisAmount: splitQris };
  }
}

function SummaryRow({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.summaryRow}>
      <Text variant="body" color={colors.neutral700}>
        {label}
      </Text>
      <Text variant="body" color={valueColor ?? colors.neutral700} style={styles.tabularText}>
        {value}
      </Text>
    </View>
  );
}

function TenderPill({ label, active, onPress }: { label: TenderLabel; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tenderPill, active ? styles.tenderPillActive : styles.tenderPillInactive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text variant="h3" color={active ? colors.accent700 : colors.neutral700} style={styles.tenderPillLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space[4], paddingBottom: space[8] },
  lines: { borderTopWidth: 1, borderTopColor: colors.text },
  line: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  lineInfo: { flex: 1 },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
  },
  stepperButton: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  stepperQty: { width: 26, textAlign: "center", fontSize: 14 },
  lineTotal: { width: 80, textAlign: "right", fontSize: 14.5 },
  summary: { marginTop: space[3] },
  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  tabularText: { fontVariant: ["tabular-nums"] },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    borderTopWidth: 1,
    borderTopColor: colors.text,
    marginTop: space[2],
    paddingTop: space[2],
  },
  totalValue: { fontSize: 26 },
  sectionLabel: { marginTop: space[6], marginBottom: space[2] },
  tenderGrid: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  tenderPill: {
    width: "48%",
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: "center",
    minHeight: 48,
    justifyContent: "center",
  },
  tenderPillActive: { backgroundColor: "rgba(182, 130, 53, 0.14)", borderColor: colors.accent },
  tenderPillInactive: { backgroundColor: "transparent", borderColor: colors.divider },
  tenderPillLabel: { fontSize: 14 },
  splitCard: {
    marginTop: space[3],
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    padding: space[3],
  },
  slider: { width: "100%", marginTop: space[2] },
  error: { marginTop: space[3] },
  payButton: { marginTop: space[6] },
});
