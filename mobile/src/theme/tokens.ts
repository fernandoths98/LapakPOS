import { Platform } from "react-native";

/**
 * Lapak design tokens.
 *
 * These replace the "classical" editorial system the prototype shipped with
 * (cream ground, brass accent, serif faces, 2-7px radii). That system was
 * coherent but aimed at the wrong reader: Lapak is used one-handed, at a
 * counter, in daylight glare or a dim warung, by someone who is also handling
 * cash and talking to a customer. So the identity here optimises for glance
 * speed over refinement — white card slabs on a grey ground, one saturated
 * action colour, and money rendered large.
 *
 * The orange is a deliberate descendant of the prototype's brass #b68235:
 * same hue family, taken to full saturation. Brand continuity, more shout.
 *
 * Every text colour below was checked for WCAG AA contrast (>=4.5:1) against
 * the surface it is meant to sit on; the ratio is noted where it is close.
 */

export const colors = {
  bg: "#f5f6f7",
  surface: "#ffffff",
  text: "#14181f",
  accent: "#f0801a",
  /** Ink at 12% — hairlines between rows, never as a border on a tappable thing. */
  divider: "rgba(20, 24, 31, 0.12)",

  neutral100: "#f4f5f6",
  neutral200: "#e7e9ec",
  neutral300: "#d3d7dc",
  neutral400: "#b0b6bf",
  neutral500: "#8b929d",
  /** 4.8:1 on white — the floor for secondary text. Do not go lighter for copy. */
  neutral600: "#6b7280",
  neutral700: "#4b5563",
  neutral800: "#333b47",
  neutral900: "#1d232c",

  accent100: "#fff4e6",
  accent200: "#ffe3c2",
  accent300: "#fcc98d",
  accent400: "#f8ad5b",
  accent500: "#f0801a",
  accent600: "#d0670c",
  /** 5.7:1 on white — the accent shade that is safe for text and icons. */
  accent700: "#a44f08",
  accent800: "#7c3b07",
  accent900: "#522705",

  /** Money that went the right way: takings, positive deltas, settled bills. */
  success: "#0c6b4f",
  successBg: "#e6f4ee",
  /** Cash discrepancies, voids, failed sync — anything the owner must look at. */
  danger: "#c62f2f",
  dangerBg: "#fdecec",
} as const;

/**
 * The platform's own sans — Roboto on Android, San Francisco on iOS. The
 * prototype shipped Cormorant Garamond and Lora as TTFs that were never
 * linked natively, so on a real device the type silently fell back to the
 * system serif anyway. A counter app has no business paying a font-loading
 * penalty for a display serif, and both system faces have the tabular
 * numerals that money columns need, so the fallback is now the actual choice.
 */
const systemSans = Platform.select({
  ios: "System",
  android: "sans-serif",
  default: "System",
});

export const fonts = {
  heading: systemSans,
  body: systemSans,
} as const;

/** 4/8 grid. Keys match the old 4.6-based scale so screens did not have to change. */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  lg: 18,
  pill: 999,
} as const;

/** Android's accessibility floor for a tap target, and the counter's floor too. */
export const minTapTarget = 48;

/**
 * Cards are raised now rather than whispered — on a grey ground the lift is
 * what tells a busy thumb the slab is tappable.
 */
export const shadow = {
  sm: {
    shadowColor: colors.neutral900,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: colors.neutral900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  lg: {
    shadowColor: colors.neutral900,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 28,
    elevation: 10,
  },
} as const;
