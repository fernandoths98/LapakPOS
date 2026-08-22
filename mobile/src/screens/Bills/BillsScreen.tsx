import React, { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, useWindowDimensions, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Check,
  ChevronRight,
  CircleAlert,
  Droplets,
  Flame,
  Gamepad2,
  HeartPulse,
  Search,
  Smartphone,
  Tv,
  WalletCards,
  Wifi,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react-native";
import { formatRupiah, PpobBiller, PpobCategory, PpobTransaction } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { colors, radius, shadow, space } from "../../theme/tokens";
import { useBillers, usePpobCommissionSummary, usePpobProviderStatus, usePpobTransactions, useWalletSummary } from "../../state/api/ppob";
import { BillsStackParamList } from "../../app/stacks/BillsStack";

const CATEGORY_META: Record<PpobCategory, { icon: LucideIcon; label: string; color: string; tint: string }> = {
  electricity: { icon: Zap, label: "Listrik PLN", color: "#D98200", tint: "#FFF6DF" },
  mobile: { icon: Smartphone, label: "Pulsa & Data", color: "#1559C5", tint: "#EDF4FF" },
  water: { icon: Droplets, label: "PDAM", color: "#0783A8", tint: "#E9F8FC" },
  health_insurance: { icon: HeartPulse, label: "BPJS", color: "#168A52", tint: "#EAF8F0" },
  ewallet: { icon: WalletCards, label: "E-Wallet", color: "#7A4CBD", tint: "#F4EEFC" },
  internet_tv: { icon: Wifi, label: "Internet & TV", color: "#E53935", tint: "#FFF1F0" },
  games: { icon: Gamepad2, label: "Voucher Game", color: "#7A4CBD", tint: "#F4EEFC" },
  tv_voucher: { icon: Tv, label: "Voucher TV", color: "#B54708", tint: "#FFF4E8" },
  gas: { icon: Flame, label: "Gas", color: "#C4320A", tint: "#FFF1ED" },
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
}

export function BillsScreen() {
  const { width: screenWidth } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<BillsStackParamList>>();
  const billersQuery = useBillers();
  const transactionsQuery = usePpobTransactions(20);
  const summaryQuery = usePpobCommissionSummary();
  const providerQuery = usePpobProviderStatus();
  const walletQuery = useWalletSummary();
  const [query, setQuery] = useState("");
  const serviceColumns = screenWidth >= 700 ? 4 : 2;
  const serviceTileWidth = (screenWidth - space[4] * 2 - space[2] * (serviceColumns - 1)) / serviceColumns;
  const billers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return billersQuery.data ?? [];
    return (billersQuery.data ?? []).filter((item) =>
      `${item.name} ${item.sub} ${CATEGORY_META[item.category].label}`.toLowerCase().includes(needle),
    );
  }, [billersQuery.data, query]);
  const refreshing = billersQuery.isRefetching || transactionsQuery.isRefetching || summaryQuery.isRefetching || walletQuery.isRefetching;
  const refresh = () => { billersQuery.refetch(); transactionsQuery.refetch(); summaryQuery.refetch(); walletQuery.refetch(); };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.accent2} />}>
      <View style={styles.headerRow}>
        <View><Text variant="h2">PPOB & Top Up</Text><Text variant="caption" color={colors.neutral600} style={styles.headerCaption}>Semua pembayaran dalam satu kasir</Text></View>
        <View style={styles.liveBadge}><View style={styles.liveDot} /><Text variant="caption" color={colors.success}>ONLINE</Text></View>
      </View>
      {providerQuery.data?.provider === "digiflazz" ? <View style={styles.providerBanner}>
        <View style={styles.providerDot} />
        <View style={styles.providerText}><Text variant="body" style={styles.providerTitle}>Digiflazz terhubung</Text><Text variant="caption" color={colors.neutral600}>{providerQuery.data.mode === "development" ? "Mode uji · tidak memotong saldo nyata" : "Mode produksi · transaksi nyata"}</Text></View>
        <Text variant="caption" color={providerQuery.data.configured ? colors.success : colors.accent}>{providerQuery.data.configured ? "SIAP" : "PERIKSA"}</Text>
      </View> : null}
      <View style={styles.balanceCard}>
        <View style={styles.balanceTop}>
          <View><Text variant="caption" color="#DCE9FF">SALDO PPOB</Text><Text variant="h1" color={colors.surface} style={styles.balanceValue}>{walletQuery.data ? formatRupiah(walletQuery.data.balance) : "—"}</Text></View>
          <Pressable onPress={() => navigation.navigate("WalletTopup")} style={styles.topupButton}><Text variant="body" color={colors.accent2} style={styles.topupLabel}>+ Isi saldo</Text></Pressable>
        </View>
        <View style={styles.balanceFooter}><Text variant="caption" color="#DCE9FF">Pendapatan bulan ini</Text><Text variant="tabular" color={colors.surface}>+{summaryQuery.data ? formatRupiah(summaryQuery.data.commissionThisMonth) : "—"}</Text></View>
      </View>
      <View style={styles.searchBox}>
        <Search size={20} color={colors.neutral500} strokeWidth={2} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Cari PLN, pulsa, BPJS..." placeholderTextColor={colors.neutral500} style={styles.searchInput} returnKeyType="search" />
        {query ? <Pressable onPress={() => setQuery("")} hitSlop={10} accessibilityLabel="Hapus pencarian"><X size={19} color={colors.neutral500} /></Pressable> : null}
      </View>
      <View style={styles.sectionHeading}><Text variant="h3">Pilih layanan</Text><Text variant="caption" color={colors.neutral600}>{billers.length} tersedia</Text></View>
      {billersQuery.isLoading ? <ActivityIndicator style={styles.loading} color={colors.accent2} /> : null}
      {billersQuery.isError ? <Pressable onPress={() => billersQuery.refetch()} style={styles.errorState}><Text variant="body">Layanan gagal dimuat.</Text><Text variant="caption" color={colors.accent2}>Ketuk untuk mencoba lagi</Text></Pressable> : null}
      <View style={styles.grid}>{billers.map((biller) =>
        <BillerTile key={biller.id} width={serviceTileWidth} biller={biller} onPress={() => navigation.navigate("BillForm", { billerId: biller.id, billerName: biller.name, category: biller.category })} />
      )}</View>
      {!billersQuery.isLoading && !billersQuery.isError && billers.length === 0 ? <Text variant="body" color={colors.neutral600} style={styles.empty}>Layanan tidak ditemukan.</Text> : null}
      <View style={[styles.sectionHeading, styles.historyHeading]}><Text variant="h3">Transaksi terakhir</Text><Text variant="caption" color={colors.accent2}>Terbaru</Text></View>
      {transactionsQuery.isLoading ? <ActivityIndicator style={styles.loading} color={colors.accent2} /> : null}
      <View style={styles.historyCard}>
        {(transactionsQuery.data ?? []).length === 0 && !transactionsQuery.isLoading ? <View style={styles.emptyHistory}><Text variant="body" color={colors.neutral600}>Belum ada transaksi PPOB.</Text></View> : null}
        {(transactionsQuery.data ?? []).map((tx, index) => <RecentRow key={tx.id} transaction={tx} last={index === (transactionsQuery.data?.length ?? 0) - 1} />)}
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

function BillerTile({ biller, onPress, width }: { biller: PpobBiller; onPress: () => void; width: number }) {
  const meta = CATEGORY_META[biller.category];
  const ServiceIcon = meta.icon;
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.tile, { width }, pressed && styles.tilePressed]} accessibilityRole="button">
    <View style={[styles.serviceIcon, { backgroundColor: meta.tint }]}><ServiceIcon size={22} color={meta.color} strokeWidth={2.2} /></View>
    <View style={styles.tileText}><Text variant="body" style={styles.tileName} numberOfLines={1}>{meta.label}</Text><Text variant="caption" color={colors.neutral600} numberOfLines={1}>{biller.sub}</Text><Text variant="caption" color={colors.success} style={styles.tileMargin}>{`Komisi ${formatRupiah(biller.marginAmount)}`}</Text></View>
    <ChevronRight size={17} color={colors.neutral400} />
  </Pressable>;
}

function RecentRow({ transaction, last }: { transaction: PpobTransaction; last: boolean }) {
  const success = transaction.status === "success";
  const pending = transaction.status === "pending";
  return <View style={[styles.row, last && styles.lastRow]}>
    <View style={[styles.statusIcon, success ? styles.statusSuccess : pending ? styles.statusPending : styles.statusFailed]}>
      {success ? <Check size={18} color={colors.success} strokeWidth={2.5} /> : <CircleAlert size={18} color={pending ? colors.warning : colors.accent} />}
    </View>
    <View style={styles.rowBody}><Text variant="body" style={styles.rowTitle} numberOfLines={1}>{transaction.billerName}</Text><Text variant="caption" color={colors.neutral600} numberOfLines={1}>{formatTime(transaction.createdAt)} · {transaction.customerNumber}</Text></View>
    <View style={styles.rowEnd}><Text variant="tabular">{formatRupiah(transaction.totalCharged)}</Text><Text variant="caption" color={success ? colors.success : pending ? colors.warning : colors.accent}>{success ? "Berhasil" : pending ? "Diproses" : "Gagal"}</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg }, content: { paddingHorizontal: space[4], paddingTop: 0, paddingBottom: space[8] },
  headerRow: { minHeight: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, headerCaption: { marginTop: 2 },
  providerBanner: { flexDirection: "row", alignItems: "center", gap: space[2], backgroundColor: "#EAF8F0", borderRadius: radius.md, padding: space[3], marginTop: space[3] }, providerDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.success }, providerText: { flex: 1 }, providerTitle: { fontWeight: "600" },
  liveBadge: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#EAF8F0", borderRadius: 14, paddingHorizontal: 9, paddingVertical: 6 }, liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.success },
  balanceCard: { marginTop: space[4], backgroundColor: colors.accent2, borderRadius: radius.lg, padding: space[4], ...shadow.md }, balanceTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, balanceValue: { fontSize: 28, marginTop: 4 }, topupButton: { backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 10 }, topupLabel: { fontWeight: "600" }, balanceFooter: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.2)", marginTop: space[3], paddingTop: space[3] },
  searchBox: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 48, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, paddingHorizontal: space[3], marginTop: space[4] }, searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
  sectionHeading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 20, marginBottom: space[3] }, loading: { marginVertical: space[4] }, grid: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  tile: { minHeight: 92, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.sm, padding: space[2] + 2, flexDirection: "row", alignItems: "flex-start", gap: space[2], ...shadow.sm }, tilePressed: { transform: [{ scale: 0.98 }], borderColor: colors.accent2 }, tileDisabled: { opacity: 0.58 }, serviceIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" }, tileText: { flex: 1, minWidth: 0 }, tileName: { fontWeight: "600", fontSize: 14 }, tileMargin: { marginTop: 4, fontSize: 10.5 },
  empty: { textAlign: "center", paddingVertical: space[6] }, errorState: { alignItems: "center", paddingVertical: 20 }, historyHeading: { marginTop: space[6] }, historyCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider, overflow: "hidden" }, emptyHistory: { alignItems: "center", padding: space[6] },
  row: { flexDirection: "row", alignItems: "center", gap: space[3], padding: space[3], borderBottomWidth: 1, borderBottomColor: colors.divider }, lastRow: { borderBottomWidth: 0 }, statusIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" }, statusSuccess: { backgroundColor: "#EAF8F0" }, statusPending: { backgroundColor: "#FFF6DF" }, statusFailed: { backgroundColor: colors.accent100 }, rowBody: { flex: 1, minWidth: 0 }, rowTitle: { fontWeight: "600" }, rowEnd: { alignItems: "flex-end", flexShrink: 0 },
});
