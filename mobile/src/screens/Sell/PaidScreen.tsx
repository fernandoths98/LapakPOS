import React, { useState } from "react";
import { Alert, Platform, StyleSheet, View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { formatRupiah, TenderType } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { colors, space } from "../../theme/tokens";
import { useCartStore } from "../../state/cart/cartStore";
import { SellStackParamList } from "../../app/stacks/SellStack";
import { PrintSheetScreen } from "../Print/PrintSheetScreen";
import { IOS_UNAVAILABLE_MESSAGE, ReceiptLine } from "../../lib/bluetoothPrinter";
import { buildSaleReceiptLines } from "../../lib/bluetoothPrinter/receiptFormatting";

const TENDER_LABEL: Record<TenderType, string> = {
  cash: "Cash",
  qris: "QRIS",
  debit: "Debit card",
  split: "Split",
};

// Merchant header for the receipt. A real merchant-settings screen (address
// and phone come from the Merchant record) isn't in scope for this phase,
// so — same as the prototype — these are the known seeded merchant's static
// values rather than fetched from the API.
const MERCHANT_NAME = "Warung Sari Rasa";
const MERCHANT_ADDRESS_LINE = "Jl. Kaliurang KM 5 · 0812-3344-9080";

export function PaidScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SellStackParamList>>();
  const route = useRoute<RouteProp<SellStackParamList, "Paid">>();
  const { sale } = route.params;
  const clearCart = useCartStore((s) => s.clear);

  const time = new Date(sale.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const tenderLabel = TENDER_LABEL[sale.tenderType];
  const [printSheetVisible, setPrintSheetVisible] = useState(false);

  const receiptLines: ReceiptLine[] = buildSaleReceiptLines(sale, tenderLabel, {
    name: MERCHANT_NAME,
    addressLine: MERCHANT_ADDRESS_LINE,
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
    <View style={styles.container}>
      <View style={styles.hero}>
        <View style={styles.check}>
          <Text variant="h1" color={colors.accent700} style={styles.checkGlyph}>
            ✓
          </Text>
        </View>
        <Text variant="h1" style={styles.paidTitle}>
          Paid
        </Text>
        <Text variant="tabular" color={colors.neutral700}>
          {tenderLabel} · {formatRupiah(sale.total)} · {time}
        </Text>
      </View>

      <View style={styles.receipt}>
        <Text variant="h3" style={styles.receiptMerchant}>
          {MERCHANT_NAME}
        </Text>
        <Text variant="caption" style={styles.receiptAddress}>
          {MERCHANT_ADDRESS_LINE}
        </Text>
        <View style={styles.dashedRule} />
        {sale.lineItems.map((line) => (
          <View key={line.id} style={styles.receiptRow}>
            <Text variant="caption" style={styles.receiptLeft} numberOfLines={1}>
              {line.qty}x {line.productName.slice(0, 18)}
            </Text>
            <Text variant="caption" style={styles.receiptRight}>
              {formatRupiah(line.lineTotal)}
            </Text>
          </View>
        ))}
        <View style={styles.receiptRow}>
          <Text variant="caption" style={styles.receiptLeft}>
            Tender
          </Text>
          <Text variant="caption" style={styles.receiptRight}>
            {tenderLabel}
          </Text>
        </View>
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
          Terima kasih · powered by Lapak
        </Text>
      </View>

      <View style={styles.actions}>
        <Button title="Print receipt" onPress={handlePrint} style={styles.actionButton} />
        <Button title="New sale" variant="secondary" onPress={handleNewSale} style={styles.actionButton} />
      </View>
      <Text variant="caption" color={colors.neutral600} style={styles.shareCaption}>
        Share by WhatsApp · Email · Copy link
      </Text>

      <PrintSheetScreen
        visible={printSheetVisible}
        onClose={() => setPrintSheetVisible(false)}
        jobType="receipt"
        lines={receiptLines}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: space[4] },
  hero: {
    alignItems: "center",
    paddingVertical: space[4],
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  check: { alignItems: "center", justifyContent: "center" },
  checkGlyph: { fontSize: 34, lineHeight: 38 },
  paidTitle: { marginTop: space[2] },
  receipt: {
    marginTop: space[4],
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
  receiptLeft: { flex: 1 },
  receiptRight: { flexShrink: 0 },
  receiptTotalLabel: { fontSize: 12.5 },
  receiptTotalValue: { fontSize: 12.5 },
  receiptFooter: { textAlign: "center", marginTop: space[2] },
  actions: { flexDirection: "row", gap: space[2], marginTop: space[4] },
  actionButton: { flex: 1 },
  shareCaption: { textAlign: "center", marginTop: space[3] },
});
