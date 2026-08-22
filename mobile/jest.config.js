module.exports = {
  preset: '@react-native/jest-preset',
  // react-navigation and a few RN peer libs ship untranspiled ESM; the
  // default preset ignore pattern skips all of node_modules, so this widens
  // it to still transform those specific packages.
  transformIgnorePatterns: [
    'node_modules/(?!(@react-native|react-native|@react-navigation|react-native-screens|react-native-safe-area-context|@react-native-async-storage|react-native-image-picker|@react-native-documents|react-native-blob-util|react-native-share|lucide-react-native)/)',
  ],
  setupFiles: ['./jest.setup.js'],
  moduleNameMapper: {
    '^lucide-react-native$': '<rootDir>/__mocks__/lucide-react-native.js',
    '^react-native-qrcode-svg$': '<rootDir>/__mocks__/react-native-qrcode-svg.js',
  },
};
