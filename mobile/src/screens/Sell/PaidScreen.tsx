import React, { useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatRupiah, TenderType } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { colors, space } from "../../theme/tokens";
import { useCartStore } from "../../state/cart/cartStore";
import { useMerchant } from "../../state/api/merchant";
import { SellStackParamList } from "../../app/stacks/SellStack";
import { PrintSheetScreen } from "../Print/PrintSheetScreen";
import { IOS_UNAVAILABLE_MESSAGE, ReceiptLine } from "../../lib/bluetoothPrinter";
import { buildSaleReceiptLines } from "../../lib/bluetoothPrinter/receiptFormatting";

const TENDER_LABEL: Record<TenderType, string> = {
  cash: "Tunai",
  qris: "QRIS",
  debit: "Kartu debit",
  split: "Split",
};

export function PaidScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SellStackParamList>>();
  const route = useRoute<RouteProp<SellStackParamList, "Paid">>();
  const { sale, cashReceived, change } = route.params;
  const clearCart = useCartStore((s) => s.clear);
  const merchantQuery = useMerchant();
  const merchantName = merchantQuery.data?.name ?? "Kotdee POS";
  const merchantAddressLine = [merchantQuery.data?.address, merchantQuery.data?.phone].filter(Boolean).join(" · ");

  const time = new Date(sale.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const tenderLabel = TENDER_LABEL[sale.tenderType];
  const [printSheetVisible, setPrintSheetVisible] = useState(false);
  const { width, height } = useWindowDimensions();
  const isLandscape = width >= 800 && width > height;

  const receiptLines: ReceiptLine[] = buildSaleReceiptLines(sale, tenderLabel, {
    name: merchantName,
    addressLine: merchantAddressLine,
  });

  const handlePrint = () => {
    if (Platform.OS !== "android") {
      Alert.alert("Print receipt", IOS_UNAVAILABLE_MESSAGE);
      return;
    }
    setPrintSheetVisible(true);
  };

  const handleNewSale = () => {
    clearCart();
    navigation.popToTop();
  };

  return (
    <SafeAreaView style={styles.container} edges={[]}>
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, isLandscape && styles.contentLandscape]}>
      <View style={[styles.hero, isLandscape && styles.heroLandscape]}>
        <View style={styles.check}>
          <Text variant="h1" color={colors.accent700} style={styles.checkGlyph}>
            ✓
          </Text>
        </View>
        <Text variant="h1" style={styles.paidTitle}>
          Pembayaran berhasil
        </Text>
        <Text variant="tabular" color={colors.neutral700}>
          {tenderLabel} · {formatRupiah(sale.total)} · {time}
        </Text>
      </View>

      <View style={[styles.receiptColumn, isLandscape && styles.receiptColumnLandscape]}>
      <Text variant="kicker" style={styles.receiptLabel}>PREVIEW STRUK</Text>
      <View style={styles.receipt}>
        <Text variant="h3" style={styles.receiptMerchant}>
          {merchantName}
        </Text>
        <Text variant="caption" style={styles.receiptAddress}>
          {merchantAddressLine}
        </Text>
        <View style={styles.dashedRule} />
        {sale.lineItems.map((line) => (
          <View key={line.id} style={styles.receiptItem}>
            <Text variant="caption" style={styles.receiptProduct} numberOfLines={1}>{line.productName}</Text>
            <View style={styles.receiptRow}>
              <Text variant="caption" style={styles.receiptUnit}>{line.qty} × {formatRupiah(line.unitPrice)}</Text>
              <Text variant="caption" style={styles.receiptRight}>{formatRupiah(line.lineTotal)}</Text>
            </View>
          </View>
        ))}
        <View style={styles.receiptRow}>
          <Text variant="caption" style={styles.receiptLeft}>
            Pembayaran
          </Text>
          <Text variant="caption" style={styles.receiptRight}>
            {tenderLabel}
          </Text>
        </View>
        {cashReceived !== undefined ? (
          <>
            <View style={styles.receiptRow}>
              <Text variant="caption" style={styles.receiptLeft}>Tunai</Text>
              <Text variant="caption" style={styles.receiptRight}>{formatRupiah(cashReceived)}</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text variant="caption" style={styles.receiptLeft}>Kembalian</Text>
              <Text variant="caption" style={styles.receiptRight}>{formatRupiah(change ?? 0)}</Text>
            </View>
          </>
        ) : null}
        <View style={styles.dashedRule} />
        <View style={styles.receiptRow}>
          <Text variant="caption" style={styles.receiptTotalLabel}>
            TOTAL
          </Text>
          <Text variant="caption" style={styles.receiptTotalValue}>
            {formatRupiah(sale.total)}
          </Text>
        </View>
        <Text variant="caption" style={styles.receiptFooter}>
          Terima kasih · powered by Kotdee POS
        </Text>
      </View>

      <View style={styles.actions}>
        <Button title="Cetak struk sekarang" onPress={handlePrint} style={styles.actionButton} />
        <Button title="Transaksi baru" variant="secondary" onPress={handleNewSale} style={styles.actionButton} />
      </View>
      <Text variant="caption" color={colors.neutral600} style={styles.shareCaption}>
        Printer Bluetooth dipilih setelah menekan tombol cetak
      </Text>
      </View>

      <PrintSheetScreen
        visible={printSheetVisible}
        onClose={() => setPrintSheetVisible(false)}
        jobType="receipt"
        lines={receiptLines}
      />
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space[4], paddingBottom: space[8] },
  contentLandscape: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: space[8] },
  hero: {
    alignItems: "center",
    paddingVertical: space[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  heroLandscape: { width: 300, borderBottomWidth: 0, paddingTop: space[8] },
  check: { alignItems: "center", justifyContent: "center" },
  checkGlyph: { fontSize: 34, lineHeight: 38 },
  paidTitle: { marginTop: space[2] },
  receiptColumn: { width: "100%" },
  receiptColumnLandscape: { width: 430 },
  receiptLabel: { marginTop: space[4], marginBottom: space[2] },
  receipt: {
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.neutral100,
    paddingHorizontal: space[3],
    paddingTop: space[3],
    paddingBottom: space[4],
  },
  receiptMerchant: { textAlign: "center", letterSpacing: 1 },
  receiptAddress: { textAlign: "center", marginTop: 2 },
  dashedRule: { borderTopWidth: 1, borderTopColor: colors.neutral400, borderStyle: "dashed", marginVertical: space[2] },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  receiptItem: { marginBottom: 3 },
  receiptProduct: { fontWeight: "600" },
  receiptUnit: { flex: 1, paddingLeft: 8, color: colors.neutral700 },
  receiptLeft: { flex: 1 },
  receiptRight: { flexShrink: 0 },
  receiptTotalLabel: { fontSize: 12.5 },
  receiptTotalValue: { fontSize: 12.5 },
  receiptFooter: { textAlign: "center", marginTop: space[2] },
  actions: { flexDirection: "row", gap: space[2], marginTop: space[4] },
  actionButton: { flex: 1 },
  shareCaption: { textAlign: "center", marginTop: space[3] },
});
