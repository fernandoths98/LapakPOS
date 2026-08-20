/** Kotdee POS design tokens: high-contrast, fast to scan, and touch friendly. */
export const colors = {
  bg: "#F4F7FB",
  surface: "#FFFFFF",
  text: "#172033",
  accent: "#E53935",
  accent2: "#1559C5",
  success: "#168A52",
  warning: "#F3A712",
  divider: "#DDE3EC",

  neutral100: "#F8FAFC",
  neutral200: "#EEF2F7",
  neutral300: "#DDE3EC",
  neutral400: "#B7C0CE",
  neutral500: "#8792A2",
  neutral600: "#667085",
  neutral700: "#475467",
  neutral800: "#344054",
  neutral900: "#172033",

  accent100: "#FFF1F0",
  accent200: "#FFD7D4",
  accent300: "#FFAAA5",
  accent400: "#F87570",
  accent500: "#E53935",
  accent600: "#C92B27",
  accent700: "#A92320",
  accent800: "#821D1A",
  accent900: "#601714",

  accent2100: "#EDF4FF",
  accent2200: "#D7E6FF",
  accent2300: "#AFCBFF",
  accent2400: "#7EAAFA",
  accent2500: "#4F84E3",
  accent2600: "#1559C5",
  accent2700: "#10479F",
  accent2800: "#103A7D",
  accent2900: "#102F62",
} as const;

export const fonts = {
  heading: "System",
  body: "System",
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
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
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
