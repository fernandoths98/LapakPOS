import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatRupiah } from "@lapak/shared";
import { BillsStackParamList } from "../../app/stacks/BillsStack";
import { Button } from "../../components/Button";
import { Text } from "../../theme/Text";
import { colors, radius, shadow, space } from "../../theme/tokens";

export function BillSuccessScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<BillsStackParamList>>();
  const { transaction } = useRoute<RouteProp<BillsStackParamList, "BillSuccess">>().params;
  const pending = transaction.status === "pending";
  const date = new Date(transaction.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
  return <SafeAreaView style={styles.container} edges={[]}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
    <View style={[styles.successIcon, pending && styles.pendingIcon]}><Text variant="h1" color={colors.surface}>{pending ? "…" : "✓"}</Text></View>
    <Text variant="h2" style={styles.center}>{pending ? "Pembayaran diproses" : "Pembayaran berhasil"}</Text>
    <Text variant="body" color={colors.neutral600} style={styles.subtitle}>{pending ? "Jangan ulangi transaksi. Status akan diperbarui otomatis dari provider." : "Transaksi sudah tercatat dan saldo komisi telah diperbarui."}</Text>
    <View style={styles.receipt}>
      <View style={styles.receiptHeader}><View><Text variant="kicker">BUKTI TRANSAKSI</Text><Text variant="h3" style={styles.biller}>{transaction.billerName}</Text></View><View style={[styles.statusBadge, pending && styles.pendingBadge]}><Text variant="caption" color={pending ? colors.warning : colors.success}>{pending ? "DIPROSES" : "BERHASIL"}</Text></View></View>
      <View style={styles.rule} />
      <Line label="Nomor pelanggan" value={transaction.customerNumber} />
      <Line label="Nama" value={transaction.customerName} />
      <Line label="Waktu" value={date} />
      <Line label="Referensi" value={transaction.providerRef} />
      <View style={styles.rule} />
      <Line label="Tagihan" value={formatRupiah(transaction.billAmount)} />
      <Line label="Biaya admin" value={formatRupiah(transaction.adminFee)} />
      <View style={styles.totalRow}><Text variant="h3">Total dibayar</Text><Text variant="h2" color={colors.accent2}>{formatRupiah(transaction.totalCharged)}</Text></View>
      <View style={styles.commission}><Text variant="caption" color={colors.success}>Komisi toko</Text><Text variant="tabular" color={colors.success}>+{formatRupiah(transaction.marginAmount)}</Text></View>
    </View>
    <Button title="Selesai" fullWidth onPress={() => navigation.popToTop()} />
  </ScrollView>
  </SafeAreaView>;
}

function Line({ label, value }: { label: string; value: string }) {
  return <View style={styles.line}><Text variant="caption" color={colors.neutral600}>{label}</Text><Text variant="body" style={styles.lineValue} numberOfLines={1}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg }, content: { padding: space[4], paddingBottom: space[8], alignItems: "center" },
  successIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", marginTop: space[4], marginBottom: space[3], ...shadow.md }, pendingIcon: { backgroundColor: colors.warning }, center: { textAlign: "center" }, subtitle: { textAlign: "center", marginTop: space[2], lineHeight: 20, paddingHorizontal: space[4] },
  receipt: { width: "100%", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.divider, padding: space[4], marginVertical: space[6], ...shadow.sm }, receiptHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, biller: { marginTop: 4 }, statusBadge: { backgroundColor: "#EAF8F0", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 }, pendingBadge: { backgroundColor: "#FFF6DF" }, rule: { height: 1, backgroundColor: colors.divider, marginVertical: space[3] }, line: { flexDirection: "row", justifyContent: "space-between", gap: space[3], paddingVertical: 5 }, lineValue: { flex: 1, textAlign: "right" }, totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space[3] }, commission: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#EAF8F0", borderRadius: radius.sm, padding: space[2], marginTop: space[3] },
});
