/** Kotdee POS design tokens: high-contrast, fast to scan, and touch friendly. */
export const colors = {
  bg: "#F5F6FA",
  surface: "#FFFFFF",
  text: "#172033",
  accent: "#E53935",
  accent2: "#1559C5",
  success: "#168A52",
  warning: "#F3A712",
  divider: "#E7EAF0",

  /**
   * Role colours. `accent`, `success` and `warning` above are FILL colours —
   * they were being used for text too, and two of them cannot carry it:
   * #168A52 measures 4.38:1 on white and #F3A712 only 2.03:1, both under the
   * 4.5:1 floor. These are the text-safe shades of the same hues, so each
   * colour keeps one job: `accent` marks the primary action, money that grew
   * is green, anything the owner must look at is amber, and blue stays for
   * links and AI. Ratios are against `surface`.
   */
  /** 5.44:1 with white on it — the fill under every primary button label. */
  actionFill: "#C92B27",
  /** 6.57:1 — takings up, margin, a running shift. */
  moneyUp: "#0F6B3F",
  moneyUpBg: "#E7F3EC",
  /** 5.14:1 — low stock, a supplier cost rise. */
  attention: "#9A6100",
  attentionBg: "#FDF3E2",

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
  sm: 10,
  md: 14,
  lg: 22,
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
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  md: {
    shadowColor: colors.neutral900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
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
