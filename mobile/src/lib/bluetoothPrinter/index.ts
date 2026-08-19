/**
 * Thin wrapper around `react-native-bluetooth-classic` for talking to a
 * classic-Bluetooth (SPP) 58mm ESC/POS thermal printer.
 *
 * Library choice — read before changing this:
 *
 * Cheap 58mm ESC/POS printers sold in Indonesia (the prototype's "RPP02N"
 * and "Panda PRJ-58D" among them) are classic Bluetooth SPP devices, not
 * BLE, so this needed a classic-Bluetooth serial library, not a BLE one.
 * Candidates checked on npm (publish dates as of writing, Aug 2026):
 *   - react-native-bluetooth-escpos-printer — last published 2022-05,
 *     abandoned; RN peer range ">=0.55.4" with no new-architecture claim.
 *   - tp-react-native-bluetooth-printer — last published 2023-11, same story.
 *   - react-native-thermal-receipt-printer(-image-qr) — last published
 *     2023-12 / 2024-09; the maintained fork still pins a legacy peer
 *     (`react-native-ping`) and shows no new-architecture work.
 *   - react-native-esc-pos-printer — actively published (2025-10) but wraps
 *     Epson's own ePOS SDK for genuine Epson TM hardware over network/USB,
 *     not generic classic-Bluetooth ESC/POS clones — wrong tool for this job.
 *   - react-native-bluetooth-classic (kenjdavidson) — most recently
 *     published of the classic-SPP options (2025-11), explicitly targets
 *     RN >=0.73.1, and its actual API surface (verified by reading its
 *     shipped .d.ts / .js, not just the README) is a clean set of Promises
 *     — getBondedDevices/connectToDevice/write/disconnect — implemented as
 *     a plain NativeModule with no Fabric native *view* component. That's
 *     the least risky shape for RN 0.87's new architecture: it's exactly
 *     the kind of library the TurboModule interop layer is designed to keep
 *     working even without an explicit new-arch rewrite, unlike a library
 *     that also ships a native UI view. It does NOT explicitly advertise
 *     Fabric/TurboModule support, though — same category of judgment call
 *     Phase 3a made picking react-native-vision-camera's version; it cannot
 *     be fully verified without a real Android build, which this sandbox
 *     doesn't have. Flagged for manual on-device verification below.
 *
 * On the ESC/POS content side: rather than depend on a printer library's
 * own "high level" print API (bold/align/cut helpers vary in quality across
 * these packages and are a second point of failure), this wrapper hand-rolls
 * the handful of well-documented ESC/POS control bytes itself in
 * `escpos.ts` and only asks the Bluetooth library to do the one thing all
 * of them handle reliably: open a classic-SPP socket and write raw bytes.
 *
 * iOS is out of scope for this feature: Apple restricts classic Bluetooth
 * SPP to MFi-certified accessories, which generic 58mm thermal printers are
 * not, so `react-native-bluetooth-classic`'s iOS support (built on
 * ExternalAccessory, requiring a declared MFi protocol string) cannot reach
 * these printers at all. Every export below is Android-only and rejects/
 * no-ops honestly on iOS rather than pretending to work.
 */
import { NativeModules, PermissionsAndroid, Platform } from "react-native";
import RNBluetoothClassic, { BluetoothDevice } from "react-native-bluetooth-classic";
import { buildEscPosPayload } from "./escpos";
import { ReceiptLine } from "./receiptFormatting";

export type { ReceiptLine } from "./receiptFormatting";

export interface PrinterDevice {
  id: string;
  name: string;
}

export const IOS_UNAVAILABLE_MESSAGE = "Bluetooth printing isn't available on iOS yet.";

/** True on Android, where the native module is real; false on iOS, where printing is out of scope for this phase. */
export const isPrintingSupported = Platform.OS === "android";

let connectedDevice: BluetoothDevice | null = null;

/**
 * Requests the runtime Bluetooth permissions needed to discover/connect to
 * a paired printer. Android 12+ (API 31+) replaced the old
 * BLUETOOTH/BLUETOOTH_ADMIN pair with BLUETOOTH_CONNECT + BLUETOOTH_SCAN as
 * dangerous, runtime-requestable permissions; below API 31, classic
 * Bluetooth device discovery is gated behind ACCESS_FINE_LOCATION instead
 * (a long-standing Android quirk — nearby-device scanning has always been
 * treated as a location signal on older Android). No-ops to `false` on iOS.
 */
export async function requestBluetoothPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return false;

  try {
    const apiLevel = typeof Platform.Version === "number" ? Platform.Version : parseInt(String(Platform.Version), 10);

    if (apiLevel >= 31) {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      ]);
      return (
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
        granted[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED
      );
    }

    const granted = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
    return granted === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

/** Lists devices already paired in Android's system Bluetooth settings — this app never does its own pairing UI. */
export async function listPairedDevices(): Promise<PrinterDevice[]> {
  if (Platform.OS !== "android") return [];
  const devices = await RNBluetoothClassic.getBondedDevices();
  return devices.map((d) => ({ id: d.id, name: d.name }));
}

/** Opens a classic-SPP socket to the given paired device. Throws (with a real native error message) on failure — never silently "succeeds". */
export async function connect(deviceId: string): Promise<void> {
  if (Platform.OS !== "android") {
    throw new Error(IOS_UNAVAILABLE_MESSAGE);
  }
  connectedDevice = await RNBluetoothClassic.connectToDevice(deviceId);
}

/** Closes the current socket, if any. Safe to call when nothing is connected. */
export async function disconnect(): Promise<void> {
  if (!connectedDevice) return;
  const device = connectedDevice;
  connectedDevice = null;
  await device.disconnect().catch(() => undefined);
}

function clampCopies(copies: number): number {
  return Math.min(3, Math.max(1, Math.round(copies)));
}

async function writeLines(lines: ReceiptLine[], copies: number): Promise<void> {
  if (Platform.OS !== "android") {
    throw new Error(IOS_UNAVAILABLE_MESSAGE);
  }
  if (!connectedDevice) {
    throw new Error("Not connected to a printer.");
  }
  // `react-native-bluetooth-classic` pins its own nested copy of the
  // `buffer` polyfill package (a different version than the one hoisted to
  // the workspace root), so the two packages' `Buffer` classes are
  // structurally similar but not the same nominal TypeScript type — passing
  // our Buffer straight into its `write(data: string | Buffer, ...)` param
  // fails to typecheck. Sidestepping that: encode our raw ESC/POS bytes as
  // a binary (latin1) string, which round-trips arbitrary byte values 0-255
  // losslessly, and let the library's own `write(string, 'binary')` path do
  // the Buffer construction on its side.
  const payload = buildEscPosPayload(lines).toString("binary");
  const safeCopies = clampCopies(copies);
  for (let i = 0; i < safeCopies; i++) {
    // Sequential, not Promise.all — printers are single-threaded serial
    // devices and a second write landing mid-cut would corrupt the job.
    await connectedDevice.write(payload, "binary");
  }
}

/** Prints a sale receipt (already formatted by `buildSaleReceiptLines`), 1-3 copies. */
export async function printReceipt(lines: ReceiptLine[], copies: number): Promise<void> {
  await writeLines(lines, copies);
}

/** Prints a Z-report (already formatted by `buildZReportLines`), 1-3 copies. */
export async function printZReport(lines: ReceiptLine[], copies: number): Promise<void> {
  await writeLines(lines, copies);
}

/** True if the native module actually resolved (i.e. a real Android build linked it) — false in this sandbox and in Jest. */
export function isNativeModuleLinked(): boolean {
  return Platform.OS === "android" && !!NativeModules.RNBluetoothClassic;
}
