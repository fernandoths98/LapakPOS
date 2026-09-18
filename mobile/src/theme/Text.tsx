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
 *
 * The scale is deliberately a step larger than a typical app: many warung
 * owners are older and read the screen at arm's length, so body copy starts
 * at 16 and nothing a user must read goes below 14.
 */
export type TextVariant = "h1" | "h2" | "h3" | "body" | "caption" | "kicker" | "tabular" | "money";

export interface ThemedTextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
}

const variantStyles = StyleSheet.create({
  /**
   * The headline figure: takings for the day, the total a customer is told
   * out loud. Read at arm's length while handling cash and talking to
   * someone, so it outweighs everything else on the screen rather than
   * sitting a step above body text.
   */
  money: {
    fontFamily: fonts.heading,
    fontWeight: "800",
    fontSize: 42,
    lineHeight: 46,
    letterSpacing: -1.2,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  h1: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 32,
    lineHeight: 38,
    letterSpacing: -0.3,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  h2: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 25,
    lineHeight: 31,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
  h3: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 19,
    lineHeight: 25,
    color: colors.text,
  },
  body: {
    fontFamily: fonts.body,
    fontWeight: "400",
    fontSize: 16,
    lineHeight: 23,
    color: colors.text,
  },
  caption: {
    fontFamily: fonts.body,
    fontWeight: "400",
    fontSize: 14,
    lineHeight: 20,
    color: colors.neutral700,
  },
  kicker: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 13,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.neutral700,
  },
  tabular: {
    fontFamily: fonts.heading,
    fontWeight: "700",
    fontSize: 18,
    color: colors.text,
    fontVariant: ["tabular-nums"],
  },
});

export function Text({ variant = "body", color, style, ...rest }: ThemedTextProps) {
  return <RNText style={[variantStyles[variant], color ? { color } : null, style]} {...rest} />;
}
