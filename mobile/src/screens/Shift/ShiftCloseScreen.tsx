import React, { useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { CloseShiftResponse, formatRupiah, parseRupiah } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { colors, radius, space } from "../../theme/tokens";
import { useCloseShift, useCurrentShift, useZReport } from "../../state/api/shifts";
import { HomeStackParamList } from "../../app/stacks/HomeStack";
import { PrintSheetScreen } from "../Print/PrintSheetScreen";
import { IOS_UNAVAILABLE_MESSAGE } from "../../lib/bluetoothPrinter";
import { buildZReportLines } from "../../lib/bluetoothPrinter/receiptFormatting";

// Same known-seeded-merchant static value PaidScreen.tsx uses for the
// receipt header — a real merchant-settings screen isn't in scope for this
// phase, see the comment there.
const MERCHANT_NAME = "Warung Sari Rasa";

function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message ?? fallback;
}

function formatOpenedAt(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export function ShiftCloseScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const currentShiftQuery = useCurrentShift();
  const closeShift = useCloseShift();
  const zReportQuery = useZReport(currentShiftQuery.data?.shift?.id);

  const [counted, setCounted] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [closeResult, setCloseResult] = useState<CloseShiftResponse | null>(null);
  const [printSheetVisible, setPrintSheetVisible] = useState(false);

  const handlePrintZReport = () => {
    if (Platform.OS !== "android") {
      Alert.alert("Print Z-report", IOS_UNAVAILABLE_MESSAGE);
      return;
    }
    if (!zReportQuery.data) {
      Alert.alert("Z-report not ready", "Couldn't load the Z-report numbers yet. Check your connection and try again.");
      return;
    }
    setPrintSheetVisible(true);
  };

  const handleClose = async () => {
    const shift = currentShiftQuery.data?.shift;
    if (!shift) return;

    const countedCash = parseRupiah(counted);
    setErrorMessage(null);
    try {
      const result = await closeShift.mutateAsync({ shiftId: shift.id, body: { countedCash } });
      setCloseResult(result);
    } catch (err) {
      setErrorMessage(extractErrorMessage(err, "Couldn't close the shift. Check your connection and try again."));
    }
  };

  const handleDone = () => {
    navigation.navigate("Home");
  };

  if (currentShiftQuery.isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  const shift = currentShiftQuery.data?.shift ?? null;
  const running = currentShiftQuery.data?.running ?? null;

  if (!shift || !running) {
    return (
      <View style={styles.loadingContainer}>
        <Text variant="body" color={colors.neutral700}>
          No shift is currently open.
        </Text>
      </View>
    );
  }

  // Rows mirror the prototype's shiftRows exactly: Opening float, Cash sales,
  // PPOB cash in, Paid out, and Expected in drawer (the last in the ink
  // color, the others neutral) — computed live from GET /api/shifts/current's
  // running totals rather than guessed at, so they're accurate before the
  // cashier has typed anything.
  const rows = [
    { label: "Opening float", value: formatRupiah(running.openingFloat) },
    { label: "Cash sales", value: formatRupiah(running.cashSales) },
    { label: "PPOB cash in", value: formatRupiah(running.ppobCashIn) },
    { label: "Paid out (supplier)", value: `− ${formatRupiah(running.paidOut)}` },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="caption" color={colors.neutral600}>
        Opened {formatOpenedAt(shift.openedAt)} · {shift.userName}
      </Text>

      <View style={styles.rows}>
        {rows.map((row) => (
          <View key={row.label} style={styles.row}>
            <Text variant="body">{row.label}</Text>
            <Text variant="tabular">{row.value}</Text>
          </View>
        ))}
        <View style={[styles.row, styles.expectedRow]}>
          <Text variant="body" style={styles.expectedLabel}>
            Expected in drawer
          </Text>
          <Text variant="tabular" style={styles.expectedLabel}>
            {formatRupiah(running.expectedCash)}
          </Text>
        </View>
      </View>

      {closeResult ? (
        <View style={styles.discrepancyCard}>
          <Text variant="kicker">{closeResult.discrepancyTitle}</Text>
          <Text variant="body" style={styles.discrepancyBody}>
            {closeResult.discrepancyBody}
          </Text>
        </View>
      ) : (
        <>
          <TextField
            label="Counted in drawer"
            value={counted}
            onChangeText={setCounted}
            placeholder="0"
            keyboardType="numeric"
            style={styles.countedField}
          />

          {errorMessage ? (
            <Text variant="caption" color={colors.accent700} style={styles.errorText}>
              {errorMessage}
            </Text>
          ) : null}

          <View style={styles.buttonRow}>
            <Button title="Print Z-report" variant="secondary" onPress={handlePrintZReport} style={styles.halfButton} />
            <Button
              title={closeShift.isPending ? "Closing…" : "Close shift"}
              onPress={handleClose}
              disabled={closeShift.isPending || counted.trim() === ""}
              loading={closeShift.isPending}
              style={styles.halfButton}
            />
          </View>
        </>
      )}

      {closeResult ? <Button title="Back to Home" onPress={handleDone} fullWidth style={styles.doneButton} /> : null}

      <PrintSheetScreen
        visible={printSheetVisible}
        onClose={() => setPrintSheetVisible(false)}
        jobType="zreport"
        lines={zReportQuery.data ? buildZReportLines(zReportQuery.data, MERCHANT_NAME) : []}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  content: { padding: space[4], paddingBottom: space[8] },
  rows: { marginTop: space[3], borderTopWidth: 1, borderTopColor: colors.text },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: space[2] + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  expectedRow: { borderBottomWidth: 0 },
  expectedLabel: { color: colors.text },
  countedField: { marginTop: space[4] },
  discrepancyCard: {
    marginTop: space[4],
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: space[3],
  },
  discrepancyBody: { marginTop: space[2] },
  errorText: { marginTop: space[3] },
  buttonRow: { flexDirection: "row", gap: space[2], marginTop: space[4] },
  halfButton: { flex: 1 },
  doneButton: { marginTop: space[4] },
});
