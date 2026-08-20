import React from "react";
import { Text as RNText, TextProps as RNTextProps, StyleSheet } from "react-native";
import { colors, fonts } from "./tokens";

/**
 * Variant-based text so screens never hardcode fontFamily/fontSize inline.
 * Mirrors styles.css's type scale (h1..h6, body) plus two prototype-specific
 * roles: `kicker` (the small uppercase accent labels above section headers,
 * e.g. "Takings today") and `tabular` (money/figures that must line up like
 * a ledger — sets fontVariant tabular-nums per the design system's rule that
 * every number is tabular).
 */
export type TextVariant = "h1" | "h2" | "h3" | "body" | "caption" | "kicker" | "tabular";

export interface ThemedTextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
}

const variantStyles = StyleSheet.create({
  h1: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.3,
    color: colors.text,
  },
  h2: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 23,
    lineHeight: 29,
    color: colors.text,
  },
  h3: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 17,
    lineHeight: 22,
    color: colors.text,
  },
  body: {
    fontFamily: fonts.body,
    fontWeight: "400",
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  caption: {
    fontFamily: fonts.body,
    fontWeight: "400",
    fontSize: 12,
    lineHeight: 17,
    color: colors.neutral700,
  },
  kicker: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.neutral700,
  },
  tabular: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 16,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
});

export function Text({ variant = "body", color, style, ...rest }: ThemedTextProps) {
  return <RNText style={[variantStyles[variant], color ? { color } : null, style]} {...rest} />;
}
