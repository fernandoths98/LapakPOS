import React, { useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, View } from "react-native";
import { RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, CircleAlert, Clock } from "lucide-react-native";
import { formatRupiah } from "@lapak/shared";
import { BillsStackParamList } from "../../app/stacks/BillsStack";
import { Button } from "../../components/Button";
import { Text } from "../../theme/Text";
import { colors, radius, shadow, space } from "../../theme/tokens";
import { useMerchant } from "../../state/api/merchant";
import { useAccountSetup } from "../../state/api/account";
import { useAuthStore } from "../../state/auth/authStore";
import { PrintSheetScreen } from "../Print/PrintSheetScreen";
import { IOS_UNAVAILABLE_MESSAGE, ReceiptLine } from "../../lib/bluetoothPrinter";
import { buildBillReceiptLines } from "../../lib/bluetoothPrinter/receiptFormatting";

export function BillSuccessScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<BillsStackParamList>>();
  const { transaction, fromHistory = false } = useRoute<RouteProp<BillsStackParamList, "BillSuccess">>().params;
  const pending = transaction.status === "pending";
  const failed = transaction.status === "failed";
  const date = new Date(transaction.createdAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });

  const merchantQuery = useMerchant();
  const accountQuery = useAccountSetup();
  const cashierName = useAuthStore((s) => s.user?.name) || "Kasir";
  const [printSheetVisible, setPrintSheetVisible] = useState(false);

  const outlets = accountQuery.data?.outlets ?? [];
  const txOutlet = outlets.find((o) => o.id === transaction.outletId);
  // Only worth a dedicated line once the merchant actually runs more than one outlet.
  const receiptOutlet = outlets.length > 1 && txOutlet ? { name: txOutlet.name, address: txOutlet.address } : null;

  const receiptLines: ReceiptLine[] = buildBillReceiptLines(transaction, {
    merchant: {
      name: merchantQuery.data?.name ?? "Kotdee POS",
      address: merchantQuery.data?.address ?? null,
      phone: merchantQuery.data?.phone ?? null,
    },
    outlet: receiptOutlet,
    cashierName,
  });

  const handlePrint = () => {
    if (Platform.OS !== "android") {
      Alert.alert("Cetak struk", IOS_UNAVAILABLE_MESSAGE);
      return;
    }
    setPrintSheetVisible(true);
  };
  return <SafeAreaView style={styles.container} edges={[]}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
    <View style={[styles.successIcon, pending && styles.pendingIcon, failed && styles.failedIcon]}>{pending ? <Clock size={34} color={colors.surface} strokeWidth={2.4} /> : failed ? <CircleAlert size={36} color={colors.surface} strokeWidth={2.6} /> : <Check size={38} color={colors.surface} strokeWidth={3} />}</View>
    <Text variant="h2" style={styles.center}>{fromHistory ? "Detail transaksi" : pending ? "Pembayaran diproses" : failed ? "Pembayaran gagal" : "Pembayaran berhasil"}</Text>
    <Text variant="body" color={colors.neutral600} style={styles.subtitle}>{fromHistory ? date : pending ? "Jangan ulangi transaksi. Status akan diperbarui otomatis dari provider." : failed ? "Saldo tidak terpotong. Silakan coba lagi." : "Transaksi sudah tercatat dan saldo komisi telah diperbarui."}</Text>
    <View style={styles.receipt}>
      <View style={styles.receiptHeader}><View><Text variant="kicker">BUKTI TRANSAKSI</Text><Text variant="h3" style={styles.biller}>{transaction.billerName}</Text></View><View style={[styles.statusBadge, pending && styles.pendingBadge, failed && styles.failedBadge]}><Text variant="caption" color={pending ? colors.warning : failed ? colors.accent : colors.success}>{pending ? "DIPROSES" : failed ? "GAGAL" : "BERHASIL"}</Text></View></View>
      <View style={styles.rule} />
      <Line label="Nomor pelanggan" value={transaction.customerNumber} />
      <Line label="Nama" value={transaction.customerName} />
      <Line label="Waktu" value={date} />
      <Line label="Referensi" value={transaction.providerRef} />
      <View style={styles.rule} />
      <Line label="Tagihan" value={formatRupiah(transaction.billAmount)} />
      <Line label="Biaya admin" value={formatRupiah(transaction.adminFee)} />
      <View style={styles.totalRow}><Text variant="h3">Total dibayar</Text><Text variant="h2" color={colors.accent2}>{formatRupiah(transaction.totalCharged)}</Text></View>
      {failed ? null : <View style={styles.commission}><Text variant="caption" color={colors.success}>Komisi toko</Text><Text variant="tabular" color={colors.success}>+{formatRupiah(transaction.marginAmount)}</Text></View>}
    </View>
    <Button title="Cetak struk" fullWidth onPress={handlePrint} style={styles.printButton} />
    <Button title={fromHistory ? "Tutup" : "Selesai"} variant="secondary" fullWidth onPress={() => (fromHistory ? navigation.goBack() : navigation.popToTop())} />
    <PrintSheetScreen
      visible={printSheetVisible}
      onClose={() => setPrintSheetVisible(false)}
      jobType="receipt"
      lines={receiptLines}
    />
  </ScrollView>
  </SafeAreaView>;
}

function Line({ label, value }: { label: string; value: string }) {
  return <View style={styles.line}><Text variant="caption" color={colors.neutral600}>{label}</Text><Text variant="body" style={styles.lineValue} numberOfLines={1}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg }, content: { padding: space[3], paddingBottom: space[8], alignItems: "center" },
  successIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", marginTop: space[4], marginBottom: space[3], ...shadow.md }, pendingIcon: { backgroundColor: colors.warning }, failedIcon: { backgroundColor: colors.accent }, center: { textAlign: "center" }, subtitle: { textAlign: "center", marginTop: space[2], lineHeight: 20, paddingHorizontal: space[4] },
  printButton: { marginBottom: space[2] },
  receipt: { width: "100%", backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.divider, padding: space[4], marginVertical: space[6], ...shadow.sm }, receiptHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }, biller: { marginTop: 4 }, statusBadge: { backgroundColor: "#EAF8F0", paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12 }, pendingBadge: { backgroundColor: "#FFF6DF" }, failedBadge: { backgroundColor: colors.accent100 }, rule: { height: 1, backgroundColor: colors.divider, marginVertical: space[3] }, line: { flexDirection: "row", justifyContent: "space-between", gap: space[3], paddingVertical: 5 }, lineValue: { flex: 1, textAlign: "right" }, totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space[3] }, commission: { flexDirection: "row", justifyContent: "space-between", backgroundColor: "#EAF8F0", borderRadius: radius.sm, padding: space[2], marginTop: space[3] },
});
