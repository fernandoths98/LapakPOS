import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Bluetooth, Check, Printer, X } from "lucide-react-native";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { colors, space } from "../../theme/tokens";
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
  const [statusMessage, setStatusMessage] = useState("Siap mencetak");

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
    setStatusMessage("Siap mencetak");
    loadDevices();
  }, [visible, loadDevices]);

  const handlePrint = async () => {
    if (printState === "done") {
      onClose();
      return;
    }
    if (!selectedDeviceId) return;

    setPrintState("printing");
    setStatusMessage("Sedang mencetak…");
    try {
      await connect(selectedDeviceId);
      if (jobType === "receipt") {
        await printReceipt(lines, copies);
      } else {
        await printZReport(lines, copies);
      }
      await disconnect();
      setPrintState("done");
      setStatusMessage(`${copies} salinan berhasil dikirim`);
      onClose();
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

  const printButtonLabel = printState === "done" ? "Selesai" : printState === "printing" ? "Mencetak…" : "Cetak sekarang";

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose} statusBarTranslucent navigationBarTranslucent>
      <SafeAreaView style={styles.wrapper} edges={["left", "right", "bottom"]}>
        <Pressable style={styles.backdrop} onPress={handleClose} accessibilityRole="button" accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <View style={styles.titleRow}>
            <View style={styles.titleIcon}><Printer size={22} color={colors.accent2} /></View>
            <View style={styles.titleCopy}><Text variant="h3">Cetak struk</Text><Text variant="caption" color={colors.neutral600}>Pilih printer yang sudah terhubung</Text></View>
            <Pressable onPress={handleClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Tutup"><X size={21} color={colors.neutral700} /></Pressable>
          </View>

          {Platform.OS !== "android" ? (
            <Text variant="caption" color={colors.accent700} style={styles.subheading}>
              {IOS_UNAVAILABLE_MESSAGE}
            </Text>
          ) : null}

          {loadState === "unsupported" ? (
            <View style={styles.emptyState}>
              <Text variant="body" color={colors.neutral700}>
                {IOS_UNAVAILABLE_MESSAGE} Printer thermal Bluetooth Kotdee POS saat ini tersedia di Android.
              </Text>
              <Button title="Tutup" variant="secondary" onPress={handleClose} style={styles.emptyStateButton} />
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
              <Button title="Coba lagi" variant="secondary" onPress={loadDevices} style={styles.emptyStateButton} />
            </View>
          ) : devices.length === 0 ? (
            <View style={styles.emptyState}>
              <Text variant="body" color={colors.neutral700} style={styles.emptyStateText}>
                Printer belum ditemukan. Hubungkan printer melalui pengaturan Bluetooth Android terlebih dahulu.
              </Text>
              <Button title="Buka petunjuk Bluetooth" variant="secondary" onPress={() => Alert.alert("Hubungkan printer", "Buka Pengaturan Android → Bluetooth, lalu pair printer thermal Anda. Setelah tersambung, kembali dan tekan Coba lagi.")} style={styles.emptyStateButton} />
              <Button title="Coba lagi" variant="ghost" onPress={loadDevices} />
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
                      <View style={[styles.deviceIcon, isSelected && styles.deviceIconSelected]}><Printer size={20} color={isSelected ? colors.accent2 : colors.neutral600} /></View>
                      <View style={styles.deviceInfo}>
                        <Text variant="body" style={styles.deviceName}>{device.name}</Text>
                        <View style={styles.deviceMeta}><Bluetooth size={12} color={colors.neutral500} /><Text variant="caption" color={colors.neutral600}>Terhubung · thermal 58 mm</Text></View>
                      </View>
                      {isDefault && !isSelected ? <View style={styles.defaultBadge}><Text variant="caption" color={colors.accent2}>Utama</Text></View> : null}
                      <View style={[styles.radio, isSelected && styles.radioSelected]}>{isSelected ? <Check size={14} color={colors.surface} strokeWidth={3} /> : null}</View>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.printOptions}>
                <View><Text variant="body" style={styles.optionTitle}>Jumlah salinan</Text><Text variant="caption" color={colors.neutral600}>Maksimal 3 lembar</Text></View>
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
              </View>

              <View style={[styles.statusBadge, printState === "error" && styles.statusError, printState === "done" && styles.statusDone]}><View style={[styles.statusDot, printState === "error" && styles.statusDotError, printState === "done" && styles.statusDotDone]} /><Text variant="caption" color={printState === "error" ? colors.accent700 : printState === "done" ? colors.success : colors.neutral700} numberOfLines={2}>{statusMessage}</Text></View>

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
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(32,31,29,0.42)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.divider,
    paddingHorizontal: 20,
    paddingTop: space[3],
    paddingBottom: 18,
    maxHeight: "80%",
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.14,
    shadowRadius: 20,
    elevation: 16,
  },
  titleRow: { flexDirection: "row", alignItems: "center", gap: space[3] },
  titleIcon: { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent2100 },
  titleCopy: { flex: 1 },
  closeButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.neutral100 },
  grabber: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.neutral400,
    alignSelf: "center",
    marginBottom: space[4],
  },
  subheading: { marginTop: space[3], flexDirection: "row", alignItems: "center", gap: 5 },
  emptyState: { alignItems: "center", paddingVertical: space[6], gap: space[3] },
  emptyStateText: { textAlign: "center" },
  emptyStateButton: { marginTop: space[1] },
  deviceList: { marginTop: space[4], maxHeight: 210 },
  deviceListContent: { gap: space[2] },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2] + 2,
    paddingVertical: 13,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  deviceRowSelected: { borderColor: colors.accent2, backgroundColor: colors.accent2100 },
  deviceIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: colors.neutral100 },
  deviceIconSelected: { backgroundColor: colors.surface },
  deviceInfo: { flex: 1 },
  deviceName: { fontWeight: "600" },
  deviceMeta: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  defaultBadge: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 12, backgroundColor: colors.surface },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.neutral400, alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: colors.accent2, backgroundColor: colors.accent2 },
  printOptions: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space[3], padding: 12, borderRadius: 14, backgroundColor: colors.neutral100 },
  optionTitle: { fontWeight: "600" },
  stepper: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.divider, borderRadius: 12, backgroundColor: colors.surface, overflow: "hidden" },
  stepperButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  stepperValue: { width: 34, textAlign: "center" },
  statusBadge: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6, marginTop: space[3], paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, backgroundColor: colors.neutral100, maxWidth: "100%" },
  statusError: { backgroundColor: colors.accent100 },
  statusDone: { backgroundColor: "#EAF8F0" },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent2 },
  statusDotError: { backgroundColor: colors.accent },
  statusDotDone: { backgroundColor: colors.success },
  printButton: { marginTop: space[3], minHeight: 52, borderRadius: 14 },
});
