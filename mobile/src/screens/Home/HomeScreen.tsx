import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { CompositeNavigationProp, useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { formatRupiah } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { colors, radius, space } from "../../theme/tokens";
import { useTodaySummary, useHomeAlerts } from "../../state/api/home";
import { useMerchant } from "../../state/api/merchant";
import { useCurrentShift } from "../../state/api/shifts";
import { useDailyRecap } from "../../state/api/recap";
import { HomeStackParamList } from "../../app/stacks/HomeStack";
import type { MainTabsParamList } from "../../app/MainTabs";

type HomeNavigationProp = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, "Home">,
  BottomTabNavigationProp<MainTabsParamList>
>;

function formatTodayHeading(): string {
  return new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
}

function formatYesterdayShort(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return new Intl.DateTimeFormat("id-ID", { weekday: "short" }).format(yesterday);
}

function formatOpenedAt(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

const RECAP_DISMISSED_LINE = "Ringkasan disimpan dan tetap tersedia saat shift ditutup.";
const RECAP_AI_UNAVAILABLE_LINE =
  "Ringkasan AI belum aktif. Atur ANTHROPIC_API_KEY di backend untuk mengaktifkannya.";
const RECAP_LOADING_LINE = "Membaca transaksi hari ini…";
const RECAP_ERROR_LINE = "Ringkasan hari ini gagal dimuat.";

export function HomeScreen() {
  const navigation = useNavigation<HomeNavigationProp>();

  const merchantQuery = useMerchant();
  const summaryQuery = useTodaySummary();
  const alertsQuery = useHomeAlerts();
  const currentShiftQuery = useCurrentShift();
  const recapQuery = useDailyRecap();

  const [recapDismissed, setRecapDismissed] = useState(false);

  const yesterdayShort = useMemo(formatYesterdayShort, []);

  if (merchantQuery.isLoading || summaryQuery.isLoading || currentShiftQuery.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const merchant = merchantQuery.data;
  const summary = summaryQuery.data;
  const alerts = alertsQuery.data?.alerts ?? [];
  const shift = currentShiftQuery.data?.shift ?? null;

  const change = summary?.pctChangeVsYesterday ?? 0;
  const changeIsUp = change >= 0;
  const changeColor = changeIsUp ? colors.accent700 : colors.neutral700;

  const recapLine = recapQuery.isLoading
    ? RECAP_LOADING_LINE
    : recapQuery.isError || !recapQuery.data
      ? RECAP_ERROR_LINE
      : !recapQuery.data.aiAvailable
        ? RECAP_AI_UNAVAILABLE_LINE
        : recapQuery.data.headline;

  const shortcuts: { title: string; sub: string; go: () => void }[] = [
    { title: "Bayar tagihan", sub: "PLN, pulsa, BPJS", go: () => navigation.navigate("BillsTab", { screen: "Bills" }) },
    { title: "Catat pengeluaran", sub: "Kas keluar operasional", go: () => navigation.navigate("AddExpense") },
    {
      title: "Import Excel",
      sub: "Masukkan katalog produk",
      go: () => navigation.navigate("StockTab", { screen: "Sheet" }),
    },
    {
      title: "Tambah produk",
      sub: "Item katalog baru",
      go: () => navigation.navigate("StockTab", { screen: "Product", params: undefined }),
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View>
          <Text variant="kicker">{formatTodayHeading()}</Text>
          <Text variant="h2" style={styles.merchantName}>
            {merchant?.name ?? ""}
          </Text>
        </View>
        <Button
          title={shift ? `Shift aktif · ${formatOpenedAt(shift.openedAt)}` : "Buka shift"}
          variant="secondary"
          onPress={() => navigation.navigate(shift ? "ShiftClose" : "OpenShift")}
          style={styles.shiftButton}
        />
      </View>

      <View style={styles.takings}>
        <Text variant="kicker">PENJUALAN HARI INI</Text>
        <Text variant="h1" style={styles.takingsTotal}>
          {formatRupiah(summary?.total ?? 0)}
        </Text>
        <View style={styles.takingsMetaRow}>
          <Text variant="caption" color={colors.neutral700}>
            {summary?.count ?? 0} transaksi
          </Text>
          <Text color={colors.neutral400}>|</Text>
          <Text variant="caption" color={colors.neutral700}>
            Rata-rata {formatRupiah(summary?.avgTicket ?? 0)}
          </Text>
          <Text color={colors.neutral400}>|</Text>
          <Text variant="caption" color={changeColor}>
            {changeIsUp ? "▲" : "▼"} {Math.abs(Math.round(change))}% vs {yesterdayShort}
          </Text>
        </View>
      </View>

      <View style={styles.tenderStrip}>
        {(summary?.tenderMix ?? []).map((t) => (
          <View key={t.label} style={styles.tenderCell}>
            <Text variant="caption" color={colors.neutral600} style={styles.tenderLabel}>
              {t.label.toUpperCase()}
            </Text>
            <Text variant="tabular" style={styles.tenderAmount}>
              {formatRupiah(t.amount)}
            </Text>
            <View style={styles.tenderBarTrack}>
              <View style={[styles.tenderBarFill, { width: `${Math.max(0, Math.min(100, t.pct))}%` }]} />
            </View>
          </View>
        ))}
      </View>

      {!recapDismissed ? (
        <View style={styles.recapCard}>
          <Text variant="kicker">RINGKASAN</Text>
          <Text variant="body" style={styles.recapLine}>
            {recapLine}
          </Text>
          <View style={styles.recapButtons}>
            <Button
              title="Lihat laporan"
              onPress={() => navigation.navigate("RecapTab", { screen: "Recap", params: { tab: "Story" } })}
              style={styles.recapButtonFlex}
            />
            <Button title="Nanti" variant="secondary" onPress={() => setRecapDismissed(true)} />
          </View>
        </View>
      ) : (
        <View style={styles.recapCard}>
          <Text variant="body" color={colors.neutral700}>
            {RECAP_DISMISSED_LINE}
          </Text>
        </View>
      )}

      <Text variant="kicker" style={styles.sectionTitle}>
        AKSES CEPAT
      </Text>
      <View style={styles.shortcutsGrid}>
        {shortcuts.map((s) => (
          <Pressable key={s.title} onPress={s.go} style={styles.shortcutCard} accessibilityRole="button">
            <Text variant="h3" style={styles.shortcutTitle}>
              {s.title}
            </Text>
            <Text variant="caption" color={colors.neutral600} style={styles.shortcutSub}>
              {s.sub}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text variant="kicker" style={styles.sectionTitle}>
        PERLU PERHATIAN
      </Text>
      {alerts.length === 0 ? (
        <Text variant="body" color={colors.neutral600} style={styles.alertsEmpty}>
          Semua aman. Tidak ada tindakan mendesak.
        </Text>
      ) : (
        alerts.map((alert, index) => (
          <View key={`${alert.text}-${index}`} style={styles.alertRow}>
            <View style={styles.alertDot} />
            <View style={styles.alertBody}>
              <Text variant="body">{alert.text}</Text>
              <Text variant="caption" color={colors.neutral600} style={styles.alertMeta}>
                {alert.meta}
              </Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  content: { padding: space[4], paddingBottom: space[8] },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  merchantName: { marginTop: 4 },
  shiftButton: { paddingHorizontal: space[3], minHeight: 38 },
  takings: {
    marginTop: space[4],
    borderTopWidth: 1,
    borderTopColor: colors.text,
    paddingTop: space[3],
  },
  takingsTotal: { marginTop: space[1], fontSize: 40 },
  takingsMetaRow: { flexDirection: "row", gap: space[2], marginTop: space[2], alignItems: "center" },
  tenderStrip: {
    flexDirection: "row",
    marginTop: space[4],
    borderWidth: 1,
    borderColor: colors.divider,
    gap: 1,
    backgroundColor: colors.divider,
  },
  tenderCell: { flex: 1, backgroundColor: colors.bg, padding: space[2] + 2 },
  tenderLabel: { letterSpacing: 1 },
  tenderAmount: { marginTop: 4, fontSize: 16 },
  tenderBarTrack: { height: 2, marginTop: space[2], backgroundColor: "transparent" },
  tenderBarFill: { height: 2, backgroundColor: colors.accent300 },
  recapCard: {
    marginTop: space[4],
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: space[3],
  },
  recapLine: { marginTop: space[1] },
  recapButtons: { flexDirection: "row", gap: space[2], marginTop: space[3] },
  recapButtonFlex: { flex: 1 },
  sectionTitle: { marginTop: space[6], marginBottom: space[2] },
  shortcutsGrid: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  shortcutCard: {
    width: "48%",
    minHeight: 64,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    padding: space[3],
  },
  shortcutTitle: { fontSize: 15 },
  shortcutSub: { marginTop: 3 },
  alertsEmpty: { paddingVertical: space[2] },
  alertRow: {
    flexDirection: "row",
    gap: space[2] + 2,
    alignItems: "flex-start",
    paddingVertical: space[2] + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  alertDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 7,
  },
  alertBody: { flex: 1 },
  alertMeta: { marginTop: 2 },
});
