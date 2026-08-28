import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { QueryClient, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import {
  CreateSaleRequest,
  formatRupiah,
  GetCurrentShiftResponse,
  Product,
  Sale,
  TenderType,
} from '@lapak/shared';
import { Text } from '../../theme/Text';
import { Button } from '../../components/Button';
import { TextField } from '../../components/TextField';
import { Slider } from '../../components/Slider';
import { colors, radius, shadow, space } from '../../theme/tokens';
import {
  CartLine,
  cartLinesArray,
  cartTotal,
  useCartStore,
} from '../../state/cart/cartStore';
import { generateClientId, useCreateSale } from '../../state/api/sales';
import { useCurrentShift } from '../../state/api/shifts';
import { enqueue } from '../../state/offline/pendingSalesQueue';
import { SellStackParamList } from '../../app/stacks/SellStack';
import { SafeAreaView } from 'react-native-safe-area-context';

/** Attempt timeout for the live checkout POST — short on purpose: this is the
 * bound on how long the cashier waits before Lapak decides the network is
 * down and falls back to the offline queue, not a "give the server time"
 * timeout (that's `apiClient`'s global 15s, still used for every other
 * call). Passed as a per-request override so it doesn't change that
 * default. */
const CHECKOUT_TIMEOUT_MS = 6_000;

type TenderLabel = 'Tunai' | 'QRIS' | 'Kartu debit' | 'Split';
const TENDER_OPTIONS: TenderLabel[] = ['Tunai', 'QRIS', 'Kartu debit', 'Split'];
const TENDER_TYPE_BY_LABEL: Record<TenderLabel, TenderType> = {
  Tunai: 'cash',
  QRIS: 'qris',
  'Kartu debit': 'debit',
  Split: 'split',
};

export function CartScreen() {
  const navigation =
    useNavigation<NativeStackNavigationProp<SellStackParamList>>();
  const queryClient = useQueryClient();
  const lines = useCartStore(s => s.lines);
  const bump = useCartStore(s => s.bump);
  const [tender, setTender] = useState<TenderLabel | null>(null);
  const [splitPct, setSplitPct] = useState(60);
  const [discountText, setDiscountText] = useState('');
  const [cashReceivedText, setCashReceivedText] = useState('');
  const createSale = useCreateSale();
  const { data: currentShift } = useCurrentShift();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const cartLines = cartLinesArray(lines);
  const subtotal = cartTotal(lines);
  const requestedDiscount = parseMoneyInput(discountText);
  const discount = Math.min(requestedDiscount, subtotal);
  const total = Math.max(0, subtotal - discount);
  const cashReceived = parseMoneyInput(cashReceivedText);
  const change = Math.max(0, cashReceived - total);

  // Derive the QRIS remainder from the rounded cash figure (rather than
  // rounding both independently, as the prototype's display-only math
  // does) so cashAmount + qrisAmount always sums to exactly `total` — the
  // backend rejects a split sale where it doesn't.
  const splitCash = Math.round((total * splitPct) / 100);
  const splitQris = total - splitCash;

  const cashIsEnough = tender !== 'Tunai' || cashReceived >= total;
  const canPay =
    cartLines.length > 0 &&
    total > 0 &&
    Boolean(currentShift?.shift) &&
    tender !== null &&
    cashIsEnough &&
    !createSale.isPending;

  const handlePay = async () => {
    if (!tender) return;
    setSubmitError(null);
    const tenderType = TENDER_TYPE_BY_LABEL[tender];
    const { cashAmount, qrisAmount } = amountsForTender(
      tenderType,
      total,
      splitCash,
      splitQris,
    );
    const clientId = generateClientId();
    const body: CreateSaleRequest = {
      clientId,
      lineItems: cartLines.map(line => ({
        productId: line.productId,
        qty: line.qty,
      })),
      tenderType,
      cashAmount,
      qrisAmount,
      discount,
    };

    try {
      const sale = await createSale.mutateAsync({
        body,
        timeoutMs: CHECKOUT_TIMEOUT_MS,
      });
      navigation.navigate('Paid', {
        sale,
        cashReceived: tenderType === 'cash' ? cashReceived : undefined,
        change: tenderType === 'cash' ? change : undefined,
      });
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
        const offlineSale = buildOfflineSale({
          clientId,
          cartLines,
          tenderType,
          cashAmount,
          qrisAmount,
          subtotal,
          discount,
          total,
          currentShift,
        });
        enqueue({
          clientId,
          request: body,
          sale: offlineSale,
          enqueuedAt: offlineSale.createdAt,
          attempts: 0,
        });
        patchProductStockCache(queryClient, cartLines);
        navigation.navigate('Paid', {
          sale: offlineSale,
          cashReceived: tenderType === 'cash' ? cashReceived : undefined,
          change: tenderType === 'cash' ? change : undefined,
        });
        return;
      }
      setSubmitError('Pembayaran gagal. Periksa koneksi dan coba lagi.');
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <View style={styles.screenHeader}>
        <Pressable
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Kembali ke kasir"
          hitSlop={6}
        >
          <ChevronLeft size={22} color={colors.neutral700} strokeWidth={2.4} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text variant="h2">Keranjang</Text>
          <Text variant="caption">Periksa pesanan dan pilih pembayaran</Text>
        </View>
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
      >
        {!currentShift?.shift ? (
          <View style={styles.shiftWarning}>
            <Text variant="h3" color={colors.accent700}>Shift belum dibuka</Text>
            <Text variant="caption" color={colors.neutral700} style={styles.shiftWarningText}>
              Kembali ke Beranda dan buka shift agar pembayaran dapat diproses dan kas tercatat dengan benar.
            </Text>
          </View>
        ) : null}
        <View style={styles.lines}>
          {cartLines.map((line, index) => (
            <View
              key={line.productId}
              style={[styles.line, index === cartLines.length - 1 && styles.lineLast]}
            >
              <View style={styles.lineInfo}>
                <Text variant="body">{line.name}</Text>
                <Text variant="caption">
                  {formatRupiah(line.unitPrice)} / item
                </Text>
              </View>
              <View style={styles.stepper}>
                <Pressable
                  onPress={() => bump(line.productId, -1)}
                  style={styles.stepperButton}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Kurangi jumlah ${line.name}`}
                >
                  <Text variant="h3">−</Text>
                </Pressable>
                <Text variant="tabular" style={styles.stepperQty}>
                  {line.qty}
                </Text>
                <Pressable
                  onPress={() => bump(line.productId, 1)}
                  style={styles.stepperButton}
                  hitSlop={6}
                  accessibilityRole="button"
                  accessibilityLabel={`Tambah jumlah ${line.name}`}
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
          <SummaryRow label="Subtotal" value={formatRupiah(subtotal)} />
          <View style={styles.discountRow}>
            <Text variant="body" color={colors.neutral700}>
              Diskon transaksi
            </Text>
            <View style={styles.discountInputWrap}>
              <Text variant="body" color={colors.neutral500}>
                Rp
              </Text>
              <TextField
                value={discountText}
                onChangeText={value =>
                  setDiscountText(value.replace(/\D/g, ''))
                }
                keyboardType="number-pad"
                placeholder="0"
                style={styles.discountInput}
              />
            </View>
          </View>
          {requestedDiscount > subtotal ? (
            <Text variant="caption" color={colors.accent}>
              Diskon maksimal sebesar subtotal.
            </Text>
          ) : null}
          <View style={styles.totalRow}>
            <Text variant="kicker">TOTAL TAGIHAN</Text>
            <Text variant="h1" style={styles.totalValue}>
              {formatRupiah(total)}
            </Text>
          </View>
        </View>

        <Text variant="kicker" style={styles.sectionLabel}>
          METODE PEMBAYARAN
        </Text>
        <View style={styles.tenderGrid}>
          {TENDER_OPTIONS.map(option => (
            <TenderPill
              key={option}
              label={option}
              active={tender === option}
              onPress={() => setTender(option)}
            />
          ))}
        </View>

        {tender === 'Tunai' ? (
          <View style={styles.cashCard}>
            <Text variant="h3">Uang diterima</Text>
            <TextField
              value={cashReceivedText}
              onChangeText={value =>
                setCashReceivedText(value.replace(/\D/g, ''))
              }
              keyboardType="number-pad"
              placeholder="Masukkan nominal tunai"
              style={styles.cashInput}
            />
            <View style={styles.quickCashRow}>
              {quickCashAmounts(total).map(amount => (
                <Pressable
                  key={amount}
                  onPress={() => setCashReceivedText(String(amount))}
                  style={styles.quickCashButton}
                >
                  <Text variant="caption" color={colors.accent2}>
                    {amount === total ? 'Uang pas' : formatRupiah(amount)}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.changeRow}>
              <Text variant="body" color={colors.neutral700}>
                Kembalian
              </Text>
              <Text
                variant="h2"
                color={cashReceived >= total ? colors.success : colors.accent}
              >
                {formatRupiah(change)}
              </Text>
            </View>
            {cashReceived > 0 && cashReceived < total ? (
              <Text variant="caption" color={colors.accent}>
                Uang diterima masih kurang {formatRupiah(total - cashReceived)}.
              </Text>
            ) : null}
          </View>
        ) : null}

        {tender === 'Split' ? (
          <View style={styles.splitCard}>
            <SummaryRow label="Porsi tunai" value={formatRupiah(splitCash)} />
            <SummaryRow
              label="Sisa QRIS"
              value={formatRupiah(splitQris)}
              valueColor={colors.accent2}
            />
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
      </ScrollView>

      <View style={styles.payBar}>
        <View style={styles.payBarInfo}>
          <Text variant="caption" color={colors.neutral600}>TOTAL TAGIHAN</Text>
          <Text variant="h2" style={styles.payBarTotal}>{formatRupiah(total)}</Text>
        </View>
        <Button
          title={createSale.isPending ? 'Memproses…' : 'Bayar'}
          onPress={handlePay}
          disabled={!canPay}
          loading={createSale.isPending}
          style={styles.payBarButton}
        />
      </View>
    </SafeAreaView>
  );
}

interface OfflineSaleParams {
  clientId: string;
  cartLines: CartLine[];
  tenderType: TenderType;
  cashAmount: number;
  qrisAmount: number;
  subtotal: number;
  discount: number;
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
  subtotal,
  discount,
  total,
  currentShift,
}: OfflineSaleParams): Sale {
  const createdAt = new Date().toISOString();
  const shift = currentShift?.shift;
  return {
    id: `local-${clientId}`,
    merchantId: shift?.merchantId ?? 'offline',
    outletId: shift?.outletId ?? 'offline',
    shiftId: shift?.id ?? 'offline',
    orderNo: 'Queued',
    clientId,
    tenderType,
    cashAmount,
    qrisAmount,
    subtotal,
    discount,
    total,
    status: 'completed',
    createdAt,
    createdOffline: true,
    lineItems: cartLines.map(line => ({
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
function patchProductStockCache(
  queryClient: QueryClient,
  cartLines: CartLine[],
): void {
  const soldQtyByProductId = new Map(
    cartLines.map(line => [line.productId, line.qty]),
  );
  queryClient.setQueriesData<Product[]>(
    { queryKey: ['products'] },
    products => {
      if (!products) return products;
      return products.map(product => {
        const soldQty = soldQtyByProductId.get(product.id);
        return soldQty
          ? { ...product, stockQty: Math.max(0, product.stockQty - soldQty) }
          : product;
      });
    },
  );
}

function amountsForTender(
  tenderType: TenderType,
  total: number,
  splitCash: number,
  splitQris: number,
): { cashAmount: number; qrisAmount: number } {
  switch (tenderType) {
    case 'cash':
      return { cashAmount: total, qrisAmount: 0 };
    case 'qris':
      return { cashAmount: 0, qrisAmount: total };
    case 'debit':
      return { cashAmount: 0, qrisAmount: 0 };
    case 'split':
      return { cashAmount: splitCash, qrisAmount: splitQris };
  }
}

function parseMoneyInput(value: string): number {
  const parsed = Number(value.replace(/\D/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function quickCashAmounts(total: number): number[] {
  const roundUp = (step: number) => Math.ceil(total / step) * step;
  return [
    ...new Set([total, roundUp(10_000), roundUp(20_000), roundUp(50_000)]),
  ].slice(0, 4);
}

function SummaryRow({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.summaryRow}>
      <Text variant="body" color={colors.neutral700}>
        {label}
      </Text>
      <Text
        variant="body"
        color={valueColor ?? colors.neutral700}
        style={styles.tabularText}
      >
        {value}
      </Text>
    </View>
  );
}

function TenderPill({
  label,
  active,
  onPress,
}: {
  label: TenderLabel;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.tenderPill,
        active ? styles.tenderPillActive : styles.tenderPillInactive,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text
        variant="h3"
        color={active ? colors.accent2 : colors.neutral700}
        style={styles.tenderPillLabel}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { flex: 1 },
  screenHeader: { height: 56, flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[3], backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider },
  backButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm, borderWidth: 1, borderColor: colors.divider },
  headerCopy: { flex: 1 },
  content: { padding: space[3], paddingBottom: 104 },
  shiftWarning: { marginBottom: space[3], padding: space[3], borderRadius: radius.md, borderWidth: 1, borderColor: colors.accent300, backgroundColor: colors.accent100 },
  shiftWarningText: { marginTop: 3, lineHeight: 18 },
  lines: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingVertical: space[3],
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  lineLast: { borderBottomWidth: 0 },
  lineInfo: { flex: 1 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
  },
  stepperButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperQty: { width: 26, textAlign: 'center', fontSize: 14 },
  lineTotal: { width: 80, textAlign: 'right', fontSize: 14.5 },
  summary: {
    marginTop: space[3],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    padding: space[3],
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  discountInputWrap: {
    width: 132,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  discountInput: {
    minHeight: 38,
    paddingVertical: 6,
    textAlign: 'right',
    flex: 1,
  },
  tabularText: { fontVariant: ['tabular-nums'] },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    borderTopWidth: 1,
    borderTopColor: colors.text,
    marginTop: space[2],
    paddingTop: space[2],
  },
  totalValue: { fontSize: 26 },
  sectionLabel: { marginTop: space[6], marginBottom: space[2] },
  tenderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  tenderPill: {
    width: '48%',
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  tenderPillActive: {
    backgroundColor: colors.accent2100,
    borderColor: colors.accent2,
  },
  tenderPillInactive: {
    backgroundColor: colors.surface,
    borderColor: colors.divider,
  },
  tenderPillLabel: { fontSize: 14 },
  splitCard: {
    marginTop: space[3],
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: space[3],
  },
  slider: { width: '100%', marginTop: space[2] },
  cashCard: {
    marginTop: space[3],
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: space[3],
  },
  cashInput: { marginTop: space[2], fontSize: 18, fontWeight: '700' },
  quickCashRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space[2],
    marginTop: space[2],
  },
  quickCashButton: {
    borderWidth: 1,
    borderColor: colors.accent2200,
    backgroundColor: colors.accent2100,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  changeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    marginTop: space[3],
    paddingTop: space[3],
  },
  error: { marginTop: space[3] },
  payBar: {
    position: 'absolute',
    left: space[3],
    right: space[3],
    bottom: space[2],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.lg,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    ...shadow.lg,
  },
  payBarInfo: { flex: 1 },
  payBarTotal: { fontSize: 22, marginTop: 1 },
  payBarButton: { minWidth: 128 },
});
