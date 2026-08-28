import React, { useState } from "react";
import { Alert, Platform, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check } from "lucide-react-native";
import { formatRupiah, TenderType } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { colors, space } from "../../theme/tokens";
import { useCartStore } from "../../state/cart/cartStore";
import { useMerchant } from "../../state/api/merchant";
import { useAccountSetup } from "../../state/api/account";
import { SellStackParamList } from "../../app/stacks/SellStack";
import { PrintSheetScreen } from "../Print/PrintSheetScreen";
import { IOS_UNAVAILABLE_MESSAGE, ReceiptLine } from "../../lib/bluetoothPrinter";
import { buildSaleReceiptLines } from "../../lib/bluetoothPrinter/receiptFormatting";

const RECEIPT_MONO = Platform.select({ ios: "Menlo", default: "monospace" });

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
  const accountQuery = useAccountSetup();
  const merchantName = merchantQuery.data?.name ?? "Kotdee POS";

  const outlets = accountQuery.data?.outlets ?? [];
  const saleOutlet = outlets.find((o) => o.id === sale.outletId);
  // Only worth a dedicated line once the merchant actually runs more than one outlet.
  const receiptOutlet = outlets.length > 1 && saleOutlet ? { name: saleOutlet.name, address: saleOutlet.address } : null;

  const time = new Date(sale.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  const tenderLabel = TENDER_LABEL[sale.tenderType];
  const [printSheetVisible, setPrintSheetVisible] = useState(false);
  const { width, height } = useWindowDimensions();
  const isLandscape = width >= 800 && width > height;

  const receiptLines: ReceiptLine[] = buildSaleReceiptLines(sale, {
    tenderLabel,
    cashierName: sale.cashierName || "Kasir",
    merchant: { name: merchantName, address: merchantQuery.data?.address ?? null, phone: merchantQuery.data?.phone ?? null },
    outlet: receiptOutlet,
    cashReceived,
    change,
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
          <Check size={34} color={colors.accent700} strokeWidth={2.5} />
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
        <View style={styles.receiptBlock}>
          {receiptLines.map((line, index) => (
            <Text
              key={index}
              style={[styles.receiptMono, { textAlign: line.align ?? "left" }, line.bold && styles.receiptMonoBold]}
              numberOfLines={1}
            >
              {line.text.length > 0 ? line.text : " "}
            </Text>
          ))}
        </View>
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
  paidTitle: { marginTop: space[2] },
  receiptColumn: { width: "100%" },
  receiptColumnLandscape: { width: 430 },
  receiptLabel: { marginTop: space[4], marginBottom: space[2] },
  receipt: {
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    paddingVertical: space[4],
    paddingHorizontal: space[2],
    alignItems: "center",
  },
  // Auto-widths to the 32-char dashed rule, so short lines left-align to the
  // same edge instead of each centering itself in the card.
  receiptBlock: { alignSelf: "center" },
  receiptMono: {
    fontFamily: RECEIPT_MONO,
    fontSize: 11,
    lineHeight: 16,
    color: colors.text,
    includeFontPadding: false,
  },
  receiptMonoBold: { fontWeight: "700" },
  actions: { flexDirection: "row", gap: space[2], marginTop: space[4] },
  actionButton: { flex: 1 },
  shareCaption: { textAlign: "center", marginTop: space[3] },
});
