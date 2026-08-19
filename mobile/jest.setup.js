/* eslint-env jest */
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// react-native-vision-camera's native Camera module isn't linked in this
// sandbox (no Android/iOS build), and the package throws at import time if
// it can't find it. Jest never renders a real camera anyway, so this mock
// stands in with inert versions of exactly what BarcodeScanner.tsx uses.
jest.mock('react-native-vision-camera', () => {
  const React = require('react');
  return {
    Camera: React.forwardRef((_props, _ref) => null),
    useCameraDevice: () => ({ id: 'mock-back-camera', position: 'back' }),
    useCameraPermission: () => ({ hasPermission: true, requestPermission: jest.fn().mockResolvedValue(true) }),
    useCodeScanner: (config) => config,
  };
});

// @react-native-documents/picker, react-native-blob-util and react-native-share
// all reach for a native module at import time (document picker, file
// system, and share sheet respectively) that isn't linked in this sandbox
// (no Android/iOS build). None of them are exercised by App.test.tsx's
// smoke render — it only needs the imports in SheetScreen.tsx to resolve.
jest.mock('@react-native-documents/picker', () => ({
  pick: jest.fn(),
  keepLocalCopy: jest.fn(),
  types: { xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xls: 'application/vnd.ms-excel' },
  errorCodes: { OPERATION_CANCELED: 'OPERATION_CANCELED' },
  isErrorWithCode: () => false,
}));

jest.mock('react-native-blob-util', () => ({
  fs: { dirs: { CacheDir: '/mock-cache-dir' }, readFile: jest.fn() },
  config: jest.fn(() => ({ fetch: jest.fn() })),
}));

jest.mock('react-native-share', () => ({
  open: jest.fn(),
}));

// react-native-bluetooth-classic's default export constructs itself against
// NativeModules.RNBluetoothClassic at import time — undefined in this
// sandbox (no Android build), which is harmless until something actually
// calls a method on it. App.test.tsx's smoke render mounts PrintSheetScreen
// (via PaidScreen/ShiftCloseScreen), which calls listPairedDevices() on
// open; this stands in with an inert paired-devices list so that resolves
// instead of throwing on the missing native module.
jest.mock('react-native-bluetooth-classic', () => ({
  __esModule: true,
  default: {
    getBondedDevices: jest.fn().mockResolvedValue([]),
    connectToDevice: jest.fn().mockResolvedValue({ write: jest.fn().mockResolvedValue(true), disconnect: jest.fn().mockResolvedValue(true) }),
  },
}));

// react-native-mmkv's `MMKV` class talks to the native module over JSI at
// construction time, which isn't linked in this sandbox (no Android/iOS
// build). Stands in with a plain in-memory Map behind the same
// get/set/delete surface pendingSalesQueue.ts actually uses, so the queue's
// real read/write logic runs against something equivalent to real MMKV
// (synchronous, string-valued) rather than a stub of the queue itself.
jest.mock('react-native-mmkv', () => {
  class MockMMKV {
    constructor() {
      this.store = new Map();
    }
    set(key, value) {
      this.store.set(key, value);
    }
    getString(key) {
      const value = this.store.get(key);
      return typeof value === 'string' ? value : undefined;
    }
    delete(key) {
      this.store.delete(key);
    }
    clearAll() {
      this.store.clear();
    }
    addOnValueChangedListener() {
      return { remove: () => {} };
    }
  }
  return { MMKV: MockMMKV };
});

// @react-native-community/netinfo reaches for its native module at import
// time — not linked in this sandbox (no Android/iOS build). App.test.tsx's
// smoke render mounts SyncStatusBar (App.tsx), which calls useNetInfo(); this
// stands in with a fixed "online" state and inert subscription functions.
jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => () => {}),
    fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true, type: 'wifi' }),
    configure: jest.fn(),
  },
  useNetInfo: jest.fn(() => ({ isConnected: true, isInternetReachable: true, type: 'wifi' })),
}));
