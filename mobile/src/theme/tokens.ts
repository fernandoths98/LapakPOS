/**
 * Design tokens ported verbatim from
 * project/_ds/classical-e4e4887f-88d8-4081-b074-6e4c8de65617/styles.css
 *
 * Keep every value in lockstep with that file — if the design system's tokens
 * change, update them here too rather than letting screens hardcode overrides.
 */

export const colors = {
  bg: "#f3f2f2",
  surface: "#eae9e9",
  text: "#201f1d",
  accent: "#b68235",
  accent2: "#ac803e",
  // CSS source: color-mix(in srgb, #201f1d 16%, transparent)
  divider: "rgba(32, 31, 29, 0.16)",

  neutral100: "#f8f4f4",
  neutral200: "#eae7e7",
  neutral300: "#d7d3d3",
  neutral400: "#bab6b6",
  neutral500: "#9b9797",
  neutral600: "#7d7979",
  neutral700: "#605d5d",
  neutral800: "#444141",
  neutral900: "#2d2b2b",

  accent100: "#fff3e4",
  accent200: "#ffe3bf",
  accent300: "#facb8d",
  accent400: "#e1ad66",
  accent500: "#c28d41",
  accent600: "#a06f24",
  accent700: "#7d5411",
  accent800: "#5a3b0a",
  accent900: "#3a270d",

  accent2100: "#fff3e4",
  accent2200: "#ffe3be",
  accent2300: "#f5cd96",
  accent2400: "#dbaf70",
  accent2500: "#bc8f4e",
  accent2600: "#9b7232",
  accent2700: "#79561f",
  accent2800: "#573d14",
  accent2900: "#382810",
} as const;

/**
 * Real Cormorant Garamond / Lora static files live in src/assets/fonts and are
 * declared as the platform font family names below. Until `npx react-native-asset`
 * (or manual Info.plist / Android font asset linking) has been run on a real
 * iOS/Android toolchain — which this sandbox does not have — these family names
 * will not resolve on-device and RN silently falls back to the system font. The
 * files are real, downloaded TTFs; only the native linking step is deferred.
 */
export const fonts = {
  heading: "Cormorant Garamond",
  body: "Lora",
} as const;

/** Heading weight caps at 600/semibold per the design system — never bold. */
export const fontWeights = {
  headingRegular: "400" as const,
  headingMedium: "500" as const,
  headingSemibold: "600" as const,
  bodyRegular: "400" as const,
  bodyMedium: "500" as const,
  bodySemibold: "600" as const,
};

export const space = {
  1: 4.6,
  2: 9.2,
  3: 13.8,
  4: 18.4,
  6: 27.6,
  8: 36.8,
} as const;

export const radius = {
  sm: 2,
  md: 4,
  lg: 7,
} as const;

/**
 * Elevation — "a whisper", per the design system's readme (no heavy drop
 * shadows). RN has no single box-shadow token, so each preset pairs the
 * shadow* properties (iOS) with elevation (Android), tuned to roughly match
 * the ink-tinted CSS shadows (color-mix(in srgb, #2d2b2b N%, transparent)).
 */
export const shadow = {
  sm: {
    shadowColor: colors.neutral900,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.14,
    shadowRadius: 2,
    elevation: 1,
  },
  md: {
    shadowColor: colors.neutral900,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3,
  },
  lg: {
    shadowColor: colors.neutral900,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 32,
    elevation: 8,
  },
} as const;
