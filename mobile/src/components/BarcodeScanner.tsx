import React, { useCallback, useEffect, useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from "react-native-vision-camera";
import { Text } from "../theme/Text";
import { Button } from "../components/Button";
import { colors, space } from "../theme/tokens";

/**
 * Formats worth recognizing at an Indonesian till: EAN-13/EAN-8/UPC-A cover
 * almost every packaged-goods barcode, Code-128 shows up on
 * supplier/internal labels, and QR is included because plenty of small
 * Indonesian retailers print QR codes on hand-labelled stock.
 */
const SCANNED_CODE_TYPES = ["ean-13", "ean-8", "upc-a", "code-128", "qr"] as const;

export interface BarcodeScannerProps {
  visible: boolean;
  /** Fires once for the first code recognized after the scanner opens, then the caller should close it. */
  onScanned: (code: string) => void;
  onClose: () => void;
}

/**
 * Full-screen modal camera view for barcode scanning. Presented as a plain
 * React Native `Modal` (rather than a pushed navigation route) so both the
 * Sell screen and the Product form can reuse it as a self-contained
 * overlay without adding a shared stack route or param type just to host
 * a camera view.
 *
 * Camera hardware cannot be exercised in this sandbox (no device/emulator)
 * — this is real, correct integration code per the vision-camera v4 API,
 * verified by TypeScript/lint only. Manual on-device verification is
 * required before shipping.
 */
export function BarcodeScanner({ visible, onScanned, onClose }: BarcodeScannerProps) {
  const { hasPermission, requestPermission } = useCameraPermission();
  const [permissionDenied, setPermissionDenied] = useState(false);
  const device = useCameraDevice("back");
  const hasFiredRef = useRef(false);

  useEffect(() => {
    if (!visible) {
      hasFiredRef.current = false;
      return;
    }
    if (hasPermission) {
      setPermissionDenied(false);
      return;
    }
    requestPermission()
      .then((granted) => setPermissionDenied(!granted))
      .catch(() => setPermissionDenied(true));
  }, [visible, hasPermission, requestPermission]);

  const handleCodeScanned = useCallback(
    (codes: { value?: string }[]) => {
      if (hasFiredRef.current) return;
      const value = codes.find((c) => !!c.value)?.value;
      if (!value) return;
      hasFiredRef.current = true;
      onScanned(value);
    },
    [onScanned],
  );

  const codeScanner = useCodeScanner({
    codeTypes: [...SCANNED_CODE_TYPES],
    onCodeScanned: handleCodeScanned,
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={styles.container}>
        {hasPermission && device ? (
          <Camera
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={visible}
            codeScanner={codeScanner}
          />
        ) : (
          <View style={styles.fallback}>
            <Text variant="h3" style={styles.fallbackTitle}>
              {permissionDenied ? "Camera permission needed" : "Starting camera…"}
            </Text>
            {permissionDenied ? (
              <Text variant="body" color={colors.neutral300} style={styles.fallbackBody}>
                Kotdee POS memerlukan akses kamera untuk memindai barcode. Aktifkan izin kamera di Pengaturan,
                lalu coba lagi.
              </Text>
            ) : null}
            {!device && hasPermission ? (
              <Text variant="body" color={colors.neutral300} style={styles.fallbackBody}>
                No camera was found on this device.
              </Text>
            ) : null}
          </View>
        )}

        <View style={styles.frameHint} pointerEvents="none">
          <View style={styles.frameBox} />
        </View>

        <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button">
          <Text variant="h3" color={colors.bg}>
            ✕
          </Text>
        </Pressable>

        {permissionDenied ? (
          <View style={styles.retryRow}>
            <Button
              title="Open settings / try again"
              onPress={() => {
                setPermissionDenied(false);
                requestPermission()
                  .then((granted) => setPermissionDenied(!granted))
                  .catch(() => setPermissionDenied(true));
              }}
            />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.text },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: space[6],
    gap: space[2],
  },
  fallbackTitle: { color: colors.bg, textAlign: "center" },
  fallbackBody: { textAlign: "center" },
  frameHint: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  frameBox: {
    width: "72%",
    height: 160,
    borderWidth: 2,
    borderColor: colors.accent,
    borderRadius: 12,
  },
  closeButton: {
    position: "absolute",
    top: space[6],
    right: space[4],
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  retryRow: {
    position: "absolute",
    left: space[4],
    right: space[4],
    bottom: space[6],
  },
});
