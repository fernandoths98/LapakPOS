import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { Tag } from "../../components/Tag";
import { colors, radius, space } from "../../theme/tokens";
import { useMerchant } from "../../state/api/merchant";
import {
  PrinterDevice,
  ReceiptLine,
  connect,
  disconnect,
  IOS_UNAVAILABLE_MESSAGE,
  listPairedDevices,
  printReceipt,
  printZReport,
  requestBluetoothPermissions,
} from "../../lib/bluetoothPrinter";

export type PrintJobType = "receipt" | "zreport";

export interface PrintSheetScreenProps {
  visible: boolean;
  onClose: () => void;
  /** Which wrapper function to call — receipt vs Z-report — the two content flows share every other bit of UI. */
  jobType: PrintJobType;
  /** Pre-formatted content from `buildSaleReceiptLines`/`buildZReportLines` — this screen never formats receipt content itself. */
  lines: ReceiptLine[];
}

type LoadState = "loading" | "denied" | "ready" | "unsupported";
type PrintState = "idle" | "printing" | "done" | "error";

function extractErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return "Couldn't reach the printer. Check it's on and in range, and try again.";
}

/**
 * Bottom-sheet modal for printing to a paired Bluetooth thermal printer —
 * mirrors the prototype's `printOpen` sheet (device list, Copies stepper,
 * status line, Print button). Presented as a plain RN `Modal`, the same
 * choice `BarcodeScanner.tsx` made for a self-contained overlay reused from
 * more than one screen, rather than a shared-stack navigation route.
 *
 * Bluetooth/printer hardware itself cannot be exercised in this sandbox (no
 * device, no emulator, no printer) — every device list, permission result,
 * and print outcome here is wired to the real native module and will show
 * real errors on failure, never a fabricated "Sent" status. This needs
 * manual verification on a real Android phone + printer before shipping.
 */
export function PrintSheetScreen({ visible, onClose, jobType, lines }: PrintSheetScreenProps) {
  const merchantQuery = useMerchant();
  const defaultPrinterName = merchantQuery.data?.defaultPrinterName ?? null;

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [devices, setDevices] = useState<PrinterDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [copies, setCopies] = useState(1);
  const [printState, setPrintState] = useState<PrintState>("idle");
  const [statusMessage, setStatusMessage] = useState("Ready");

  const loadDevices = useCallback(async () => {
    if (Platform.OS !== "android") {
      setLoadState("unsupported");
      return;
    }
    setLoadState("loading");
    const granted = await requestBluetoothPermissions();
    if (!granted) {
      setLoadState("denied");
      return;
    }
    try {
      const paired = await listPairedDevices();
      setDevices(paired);
      setSelectedDeviceId((current) => current ?? paired.find((d) => d.name === defaultPrinterName)?.id ?? paired[0]?.id ?? null);
      setLoadState("ready");
    } catch {
      setLoadState("denied");
    }
  }, [defaultPrinterName]);

  useEffect(() => {
    if (!visible) return;
    setPrintState("idle");
    setStatusMessage("Ready");
    loadDevices();
  }, [visible, loadDevices]);

  const handlePrint = async () => {
    if (printState === "done") {
      onClose();
      return;
    }
    if (!selectedDeviceId) return;

    setPrintState("printing");
    setStatusMessage("Printing…");
    try {
      await connect(selectedDeviceId);
      if (jobType === "receipt") {
        await printReceipt(lines, copies);
      } else {
        await printZReport(lines, copies);
      }
      await disconnect();
      setPrintState("done");
      setStatusMessage(`Sent — ${copies} job${copies > 1 ? "s" : ""}`);
    } catch (err) {
      await disconnect();
      setPrintState("error");
      setStatusMessage(extractErrorMessage(err));
    }
  };

  const handleClose = () => {
    if (printState === "printing") return;
    onClose();
  };

  const printButtonLabel = printState === "done" ? "Printed · close" : printState === "printing" ? "Printing…" : "Print";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <View style={styles.wrapper}>
        <Pressable style={styles.backdrop} onPress={handleClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text variant="h3">Print to thermal printer</Text>

          {Platform.OS === "android" ? (
            <Text variant="caption" color={colors.neutral600} style={styles.subheading}>
              Bluetooth · 58mm ESC/POS
            </Text>
          ) : (
            <Text variant="caption" color={colors.accent700} style={styles.subheading}>
              {IOS_UNAVAILABLE_MESSAGE}
            </Text>
          )}

          {loadState === "unsupported" ? (
            <View style={styles.emptyState}>
              <Text variant="body" color={colors.neutral700}>
                {IOS_UNAVAILABLE_MESSAGE} Printer thermal Bluetooth Kotdee POS saat ini tersedia di Android.
              </Text>
              <Button title="Close" variant="secondary" onPress={handleClose} style={styles.emptyStateButton} />
            </View>
          ) : loadState === "loading" ? (
            <View style={styles.emptyState}>
              <ActivityIndicator color={colors.accent} />
            </View>
          ) : loadState === "denied" ? (
            <View style={styles.emptyState}>
              <Text variant="body" color={colors.neutral700} style={styles.emptyStateText}>
                Kotdee POS memerlukan izin Bluetooth untuk menemukan printer. Aktifkan izinnya di Pengaturan, lalu coba lagi.
              </Text>
              <Button title="Try again" variant="secondary" onPress={loadDevices} style={styles.emptyStateButton} />
            </View>
          ) : devices.length === 0 ? (
            <View style={styles.emptyState}>
              <Text variant="body" color={colors.neutral700} style={styles.emptyStateText}>
                No paired printers found. Pair one in Android Bluetooth settings first.
              </Text>
              <Button title="Open Bluetooth settings" variant="secondary" onPress={() => Alert.alert("Bluetooth settings", "Open your phone's Settings → Bluetooth to pair a printer.")} style={styles.emptyStateButton} />
            </View>
          ) : (
            <>
              <ScrollView style={styles.deviceList} contentContainerStyle={styles.deviceListContent}>
                {devices.map((device) => {
                  const isDefault = device.name === defaultPrinterName;
                  const isSelected = device.id === selectedDeviceId;
                  return (
                    <Pressable
                      key={device.id}
                      onPress={() => setSelectedDeviceId(device.id)}
                      style={[styles.deviceRow, isSelected && styles.deviceRowSelected]}
                      accessibilityRole="button"
                    >
                      <View style={[styles.deviceDot, isSelected && styles.deviceDotSelected]} />
                      <View style={styles.deviceInfo}>
                        <Text variant="body">{device.name}</Text>
                        <Text variant="caption" color={colors.neutral600}>
                          Paired · 58mm
                        </Text>
                      </View>
                      {isDefault ? <Tag label="Default" variant="outline" /> : null}
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.copiesRow}>
                <Text variant="body" color={colors.neutral700}>
                  Copies
                </Text>
                <View style={styles.stepper}>
                  <Pressable
                    onPress={() => setCopies((c) => Math.max(1, c - 1))}
                    style={styles.stepperButton}
                    accessibilityRole="button"
                    accessibilityLabel="Decrease copies"
                  >
                    <Text variant="h3">−</Text>
                  </Pressable>
                  <Text variant="tabular" style={styles.stepperValue}>
                    {copies}
                  </Text>
                  <Pressable
                    onPress={() => setCopies((c) => Math.min(3, c + 1))}
                    style={styles.stepperButton}
                    accessibilityRole="button"
                    accessibilityLabel="Increase copies"
                  >
                    <Text variant="h3">+</Text>
                  </Pressable>
                </View>
                <View style={styles.spacer} />
                <Text variant="caption" color={colors.neutral600} numberOfLines={1} style={styles.statusText}>
                  {statusMessage}
                </Text>
              </View>

              <Button
                title={printButtonLabel}
                onPress={handlePrint}
                loading={printState === "printing"}
                disabled={!selectedDeviceId || printState === "printing"}
                fullWidth
                style={styles.printButton}
              />
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(32,31,29,0.42)" },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderTopWidth: 1,
    borderColor: colors.text,
    paddingHorizontal: space[4],
    paddingTop: space[4],
    paddingBottom: space[6],
    maxHeight: "80%",
  },
  grabber: {
    width: 34,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.neutral400,
    alignSelf: "center",
    marginBottom: space[3],
  },
  subheading: { marginTop: 2 },
  emptyState: { alignItems: "center", paddingVertical: space[6], gap: space[3] },
  emptyStateText: { textAlign: "center" },
  emptyStateButton: { marginTop: space[1] },
  deviceList: { marginTop: space[3] },
  deviceListContent: { gap: space[2] },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2] + 2,
    paddingVertical: space[2] + 3,
    paddingHorizontal: space[2] + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  deviceRowSelected: { borderColor: colors.accent },
  deviceDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.neutral400 },
  deviceDotSelected: { backgroundColor: colors.accent },
  deviceInfo: { flex: 1 },
  copiesRow: { flexDirection: "row", alignItems: "center", gap: space[2], marginTop: space[2] },
  stepper: { flexDirection: "row", borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md },
  stepperButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  stepperValue: { width: 28, textAlign: "center" },
  spacer: { flex: 1 },
  statusText: { maxWidth: 140, textAlign: "right" },
  printButton: { marginTop: space[3] },
});
