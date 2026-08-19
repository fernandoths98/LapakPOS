import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CheckBillResponse, formatRupiah } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { colors, radius, space } from "../../theme/tokens";
import { useCheckBill, usePayBill } from "../../state/api/ppob";
import { BillsStackParamList } from "../../app/stacks/BillsStack";

/**
 * Bluetooth printing is Phase 7 — there's no printer-pairing flow yet, and
 * no merchant-settings endpoint either. This renders the seeded merchant's
 * known default printer name as static text, the same known-simplification
 * precedent Phase 2's receipt screen used for the merchant header.
 */
const PRINTER_NAME = "RPP02N";

function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message ?? fallback;
}

export function BillFormScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<BillsStackParamList>>();
  const route = useRoute<RouteProp<BillsStackParamList, "BillForm">>();
  const { billerId, billerName } = route.params;

  const checkBill = useCheckBill();
  const payBill = usePayBill();

  const [customerNumber, setCustomerNumber] = useState("");
  const [quote, setQuote] = useState<CheckBillResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Changing the number after a quote was fetched invalidates it — the quote
  // (and its checkRef) belongs to the number it was checked for.
  const handleChangeNumber = (value: string) => {
    setCustomerNumber(value);
    if (quote) setQuote(null);
    setErrorMessage(null);
  };

  const handleCheck = async () => {
    setErrorMessage(null);
    const trimmed = customerNumber.trim();
    if (!trimmed) {
      setErrorMessage("Enter a customer number first.");
      return;
    }
    try {
      const result = await checkBill.mutateAsync({ billerId, customerNumber: trimmed });
      setQuote(result);
    } catch (err) {
      setErrorMessage(extractErrorMessage(err, "Couldn't find that bill. Check the number and try again."));
    }
  };

  const handleCharge = async () => {
    if (!quote) return;
    setErrorMessage(null);
    try {
      await payBill.mutateAsync({ billerId, customerNumber: customerNumber.trim(), checkRef: quote.checkRef });
      navigation.goBack();
    } catch (err) {
      // A real failure — provider decline, expired quote, etc — surfaces inline;
      // it never gets swallowed into a silent success.
      setErrorMessage(extractErrorMessage(err, "The payment couldn't be completed. Check the bill again and retry."));
      setQuote(null);
    }
  };

  const isBusy = checkBill.isPending || payBill.isPending;
  const actionLabel = payBill.isPending
    ? "Charging…"
    : checkBill.isPending
      ? "Checking…"
      : quote
        ? `Charge customer · ${formatRupiah(quote.customerPays)}`
        : "Check bill";

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="h2">{billerName}</Text>
      <Text variant="body" color={colors.neutral700} style={styles.intro}>
        Enter the customer number. The bill is fetched live; your margin is added on top.
      </Text>

      <TextField
        label="Customer number"
        value={customerNumber}
        onChangeText={handleChangeNumber}
        placeholder="512 3344 8890"
        keyboardType="numeric"
        style={styles.field}
      />

      {quote ? (
        <View style={styles.card}>
          <Text variant="kicker">Bill found</Text>
          <Text variant="h3" style={styles.customerName}>
            {quote.customerName}
          </Text>
          <Text variant="caption" color={colors.neutral700}>
            {quote.meta}
          </Text>

          <View style={styles.divider} />

          <SummaryLine label="Bill amount" value={formatRupiah(quote.billAmount)} />
          <SummaryLine label="Admin" value={formatRupiah(quote.adminFee)} />
          <SummaryLine label="Your margin" value={formatRupiah(quote.marginAmount)} color={colors.accent700} />

          <View style={styles.totalRow}>
            <Text variant="kicker">Customer pays</Text>
            <Text variant="h2" style={styles.totalValue}>
              {formatRupiah(quote.customerPays)}
            </Text>
          </View>
        </View>
      ) : null}

      {errorMessage ? (
        <Text variant="caption" color={colors.accent700} style={styles.errorText}>
          {errorMessage}
        </Text>
      ) : null}

      <Button
        title={actionLabel}
        onPress={quote ? handleCharge : handleCheck}
        disabled={isBusy}
        loading={isBusy}
        fullWidth
        style={styles.actionButton}
      />
      <Text variant="caption" color={colors.neutral600} style={styles.printerCaption}>
        Receipt prints to {PRINTER_NAME}
      </Text>
    </ScrollView>
  );
}

function SummaryLine({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.summaryLine}>
      <Text variant="body" color={color}>
        {label}
      </Text>
      <Text variant="body" color={color}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space[4], paddingBottom: space[8] },
  intro: { marginTop: space[2] },
  field: { marginTop: space[4] },
  card: {
    marginTop: space[4],
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: space[3],
  },
  customerName: { marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: space[2] + 3 },
  summaryLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.text,
    marginTop: space[2],
    paddingTop: space[2],
  },
  totalValue: { fontSize: 20 },
  errorText: { marginTop: space[3] },
  actionButton: { marginTop: space[4] },
  printerCaption: { textAlign: "center", marginTop: space[2] },
});
