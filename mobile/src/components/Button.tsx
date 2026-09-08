import React from "react";
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from "react-native";
import { Text } from "../theme/Text";
import { colors, minTapTarget, radius, space } from "../theme/tokens";

/**
 * The prototype's design system forbade solid fills ("colour is stroke only"),
 * which made every button an outline. That is the wrong default at a counter:
 * the one control that completes a sale has to be findable by a thumb that is
 * not looking at the screen, and an outline does not carry that far.
 *
 * So `primary` is a solid slab. Its label is dark ink rather than the reflexive
 * white — white on #f0801a measures 2.7:1 and fails WCAG AA outright, while ink
 * on the same fill measures 6.6:1 and stays legible in glare.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends Omit<PressableProps, "style" | "children"> {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

const LABEL_COLOR: Record<ButtonVariant, string> = {
  primary: colors.text,
  secondary: colors.text,
  ghost: colors.accent700,
};

export function Button({
  title,
  variant = "primary",
  loading = false,
  fullWidth = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "ghost" && styles.ghost,
        fullWidth && styles.fullWidth,
        pressed && !disabled && !loading && pressedStyles[variant],
        (disabled || loading) && styles.disabled,
        style,
      ]}
      {...rest}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={LABEL_COLOR[variant]} />
        ) : (
          <Text variant="h3" style={styles.label} color={LABEL_COLOR[variant]}>
            {title}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    minHeight: minTapTarget,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
  },
  label: {
    fontSize: 16,
    fontWeight: "700",
  },
  primary: {
    backgroundColor: colors.accent,
  },
  secondary: {
    borderWidth: 1,
    borderColor: colors.neutral300,
    backgroundColor: colors.surface,
  },
  ghost: {
    backgroundColor: "transparent",
    paddingHorizontal: space[2],
  },
  fullWidth: {
    width: "100%",
  },
  disabled: {
    opacity: 0.45,
  },
});

/** Pressed feedback darkens the fill rather than tinting over it. */
const pressedStyles = StyleSheet.create({
  primary: { backgroundColor: colors.accent600 },
  secondary: { backgroundColor: colors.neutral100 },
  ghost: { backgroundColor: colors.accent100 },
});
