import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { CheckCircle2, ChevronLeft, Clock3 } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { formatRupiah, isUnlimited, PlanCode, PlanInfo, SubscriptionInvoiceResponse } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { colors, radius, shadow, space } from "../../theme/tokens";
import { apiErrorMessage } from "../../state/api/apiClient";
import {
  invalidateEntitlements,
  useCheckout,
  useEntitlements,
  usePlans,
  useSubscriptionInvoices,
} from "../../state/api/subscription";
import type { HomeStackParamList } from "../../app/stacks/HomeStack";

type Props = NativeStackScreenProps<HomeStackParamList, "Subscription">;

const cap = (n: number) => (isUnlimited(n) ? "Tanpa batas" : String(n));

function planLines(plan: PlanInfo): string[] {
  const e = plan.entitlements;
  return [
    `${cap(e.maxOutlets)} outlet`,
    `${cap(e.maxStaff)} staf`,
    `${cap(e.maxProducts)} produk`,
    `Riwayat laporan ${e.reportHistoryDays >= 365 ? `${Math.round(e.reportHistoryDays / 365)} tahun` : `${e.reportHistoryDays} hari`}`,
    e.excelIO ? "Impor/ekspor Excel" : "Tanpa impor/ekspor Excel",
    e.ai ? "Fitur AI" : "Tanpa fitur AI",
    e.multiOutlet ? "Banyak outlet + switcher" : "Satu outlet",
    e.franchise ? "Sistem franchise + royalti" : "Tanpa franchise",
  ];
}

export function SubscriptionScreen({ navigation }: Props) {
  const plansQuery = usePlans();
  const entitlementsQuery = useEntitlements();
  const checkout = useCheckout();
  const queryClient = useQueryClient();

  const [invoice, setInvoice] = useState<SubscriptionInvoiceResponse | null>(null);
  const [months, setMonths] = useState(1);
  const invoicesQuery = useSubscriptionInvoices(invoice?.status === "pending");

  const current = plansQuery.data?.current ?? "free";

  useEffect(() => {
    if (!invoice) return;
    const latest = invoicesQuery.data?.find((i) => i.id === invoice.id);
    if (latest && latest.status !== invoice.status) {
      setInvoice(latest);
      if (latest.status === "paid") invalidateEntitlements(queryClient);
    }
  }, [invoice, invoicesQuery.data, queryClient]);

  const startCheckout = async (planCode: Exclude<PlanCode, "free">) => {
    try {
      setInvoice(await checkout.mutateAsync({ planCode, months }));
    } catch (err) {
      Alert.alert("Checkout gagal", apiErrorMessage(err, "QRIS belum bisa dibuat. Coba lagi."));
    }
  };

  const usage = entitlementsQuery.data?.usage;

  if (plansQuery.isLoading) {
    return (
      <SafeAreaView style={styles.loading} edges={[]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <View style={styles.header}>
        <Pressable onPress={navigation.goBack} style={styles.back} accessibilityLabel="Kembali">
          <ChevronLeft size={23} color={colors.text} />
        </Pressable>
        <View>
          <Text variant="h2">Langganan</Text>
          <Text variant="caption">Paket aktif: {current.toUpperCase()}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {invoice ? (
          <View style={styles.invoiceCard}>
            {invoice.status === "paid" ? (
              <View style={styles.centered}>
                <CheckCircle2 size={44} color={colors.success} />
                <Text variant="h3" style={styles.mt2}>Pembayaran diterima</Text>
                <Text variant="caption" color={colors.neutral600}>Paket {invoice.planCode.toUpperCase()} aktif.</Text>
                <Button title="Selesai" onPress={() => setInvoice(null)} style={styles.mt3} />
              </View>
            ) : invoice.status === "pending" ? (
              <View style={styles.centered}>
                <Text variant="kicker">SCAN QRIS UNTUK BAYAR</Text>
                <Text variant="h2" style={styles.mt1}>{formatRupiah(invoice.amount)}</Text>
                <Text variant="caption" color={colors.neutral600}>
                  Paket {invoice.planCode.toUpperCase()} · {invoice.months} bulan
                </Text>
                <View style={styles.qrFrame}>
                  <QRCode value={invoice.qrContent} size={220} />
                </View>
                <View style={styles.pendingRow}>
                  <Clock3 size={15} color={colors.warning} />
                  <Text variant="caption" color={colors.neutral600}>Menunggu pembayaran…</Text>
                </View>
                <Button title="Batalkan" variant="secondary" onPress={() => setInvoice(null)} style={styles.mt3} />
              </View>
            ) : (
              <View style={styles.centered}>
                <Text variant="h3">Tagihan {invoice.status === "expired" ? "kedaluwarsa" : "gagal"}</Text>
                <Button title="Coba lagi" onPress={() => setInvoice(null)} style={styles.mt3} />
              </View>
            )}
          </View>
        ) : (
          <>
            {usage ? (
              <View style={styles.usageCard}>
                <Text variant="kicker">PEMAKAIAN SEKARANG</Text>
                <View style={styles.usageRow}>
                  <UsageStat label="Outlet" value={usage.outlets} />
                  <UsageStat label="Staf" value={usage.staff} />
                  <UsageStat label="Produk" value={usage.products} />
                </View>
              </View>
            ) : null}

            <View style={styles.monthsRow}>
              <Text variant="caption" color={colors.neutral600}>Bayar untuk</Text>
              {[1, 3, 6, 12].map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setMonths(m)}
                  style={[styles.monthChip, months === m && styles.monthChipActive]}
                >
                  <Text variant="caption" color={months === m ? colors.surface : colors.neutral700}>{m} bln</Text>
                </Pressable>
              ))}
            </View>

            {(plansQuery.data?.plans ?? []).map((plan) => (
              <PlanCard
                key={plan.code}
                plan={plan}
                months={months}
                isCurrent={plan.code === current}
                busy={checkout.isPending}
                onPick={() => plan.code !== "free" && startCheckout(plan.code as Exclude<PlanCode, "free">)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function UsageStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.usageStat}>
      <Text variant="h3">{value}</Text>
      <Text variant="caption" color={colors.neutral600}>{label}</Text>
    </View>
  );
}

function PlanCard({
  plan,
  months,
  isCurrent,
  busy,
  onPick,
}: {
  plan: PlanInfo;
  months: number;
  isCurrent: boolean;
  busy: boolean;
  onPick: () => void;
}) {
  const lines = useMemo(() => planLines(plan), [plan]);
  return (
    <View style={[styles.planCard, isCurrent && styles.planCardCurrent]}>
      <View style={styles.planTop}>
        <View>
          <Text variant="h3">{plan.name}</Text>
          <Text variant="caption" color={colors.neutral600}>{plan.tagline}</Text>
        </View>
        <View style={styles.priceCol}>
          <Text variant="h3">{plan.monthlyPrice === 0 ? "Gratis" : formatRupiah(plan.monthlyPrice)}</Text>
          {plan.monthlyPrice > 0 ? <Text variant="caption" color={colors.neutral500}>/bulan</Text> : null}
        </View>
      </View>
      <View style={styles.planLines}>
        {lines.map((l) => (
          <Text key={l} variant="caption" color={colors.neutral700} style={styles.planLine}>• {l}</Text>
        ))}
      </View>
      {isCurrent ? (
        <View style={styles.currentBadge}><Text variant="caption" color={colors.success}>Paket aktif</Text></View>
      ) : plan.monthlyPrice > 0 ? (
        <Button
          title={`Pilih — ${formatRupiah(plan.monthlyPrice * months)}`}
          onPress={onPick}
          loading={busy}
          fullWidth
          style={styles.pickButton}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  header: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[3], borderBottomWidth: 1, borderBottomColor: colors.divider },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  content: { padding: space[4], paddingBottom: space[8], gap: space[3] },
  usageCard: { padding: space[4], backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md },
  usageRow: { flexDirection: "row", justifyContent: "space-between", marginTop: space[3] },
  usageStat: { alignItems: "center" },
  monthsRow: { flexDirection: "row", alignItems: "center", gap: space[2], flexWrap: "wrap" },
  monthChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.surface },
  monthChipActive: { backgroundColor: colors.accent2, borderColor: colors.accent2 },
  planCard: { padding: space[4], borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, backgroundColor: colors.surface, ...shadow.sm },
  planCardCurrent: { borderColor: colors.success },
  planTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  priceCol: { alignItems: "flex-end" },
  planLines: { marginTop: space[3], gap: 3 },
  planLine: {},
  currentBadge: { marginTop: space[3], alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: "#EAF8F0" },
  pickButton: { marginTop: space[3] },
  invoiceCard: { padding: space[4], borderWidth: 1, borderColor: colors.divider, borderRadius: radius.lg, backgroundColor: colors.surface, ...shadow.sm },
  centered: { alignItems: "center" },
  qrFrame: { marginTop: space[4], padding: space[3], backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: space[3] },
  mt1: { marginTop: 4 },
  mt2: { marginTop: space[2] },
  mt3: { marginTop: space[3] },
});
