import { Platform } from "react-native";

/**
 * Concrete per-weight/style font family names.
 *
 * Android resolves a linked static font by the asset file's basename
 * (e.g. "CormorantGaramond-SemiBold"); iOS resolves it by the font's own
 * internal PostScript name, which for these Google Fonts files matches the
 * same "Family-Style" pattern. Both platforms are covered by the same
 * strings here, so once the files are linked (see react-native.config.js and
 * the deferred `npx react-native-asset` step noted in tokens.ts) no
 * per-platform branching is needed beyond what Platform.select expresses for
 * clarity.
 */
export const fontFamilies = {
  headingRegular: "CormorantGaramond-Regular",
  headingMedium: "CormorantGaramond-Medium",
  headingSemibold: "CormorantGaramond-SemiBold",
  headingItalic: "CormorantGaramond-Italic",
  bodyRegular: "Lora-Regular",
  bodyMedium: "Lora-Medium",
  bodySemibold: "Lora-SemiBold",
  bodyItalic: "Lora-Italic",
} as const;

export type FontFamilyKey = keyof typeof fontFamilies;

/**
 * System-serif fallback stack used until the native linking step has run.
 * Text.tsx does not consume this directly — it's here so screens that need a
 * one-off custom font style can degrade the same way the theme does.
 */
export const systemSerifFallback = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Times New Roman",
});
