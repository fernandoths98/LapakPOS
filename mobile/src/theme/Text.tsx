import React from "react";
import { Text as RNText, TextProps as RNTextProps, StyleSheet } from "react-native";
import { colors, fonts } from "./tokens";

/**
 * Variant-based text so screens never hardcode fontFamily/fontSize inline.
 *
 * The scale is tuned for arm's length rather than reading distance: `h1` is
 * the money hero (takings, cart total, change due) and carries tabular
 * numerals so digits stop jittering as they tick up, and `caption` runs a
 * step heavier than a print-derived scale would because it is read in a hurry.
 *
 * `kicker` is deliberately neutral, not accent-coloured: now that the accent
 * is a saturated orange it has to mean "you can act on this", so labels give
 * it up.
 */
export type TextVariant = "h1" | "h2" | "h3" | "body" | "caption" | "kicker" | "tabular";

export interface ThemedTextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
}

const variantStyles = StyleSheet.create({
  h1: {
    fontFamily: fonts.heading,
    fontWeight: "800",
    fontSize: 40,
    lineHeight: 44,
    letterSpacing: -0.8,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  h2: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 24,
    lineHeight: 29,
    letterSpacing: -0.3,
    color: colors.text,
  },
  h3: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 18,
    lineHeight: 23,
    color: colors.text,
  },
  body: {
    fontFamily: fonts.body,
    fontWeight: "400",
    fontSize: 15,
    lineHeight: 22,
    color: colors.text,
  },
  caption: {
    fontFamily: fonts.body,
    fontWeight: "500",
    fontSize: 12,
    lineHeight: 16,
    color: colors.neutral600,
  },
  kicker: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.neutral600,
  },
  tabular: {
    fontFamily: fonts.heading,
    fontWeight: "600",
    fontSize: 17,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
});

export function Text({ variant = "body", color, style, ...rest }: ThemedTextProps) {
  return <RNText style={[variantStyles[variant], color ? { color } : null, style]} {...rest} />;
}
