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
import { colors, radius, space } from "../theme/tokens";

/**
 * The primary fill is `actionFill`, not `accent`. White on #E53935 measures
 * 4.23:1 — under the 4.5:1 floor, and 15px semibold does not qualify for the
 * large-text allowance either, so the one control that completes a sale was
 * the least legible thing on screen. One step darker in the same ramp puts it
 * at 5.44:1 without introducing a new colour or changing the brand.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends Omit<PressableProps, "style" | "children"> {
  title: string;
  variant?: ButtonVariant;
  loading?: boolean;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
}

const PRESSED_TINT: Record<ButtonVariant, string> = {
  primary: colors.accent700,
  secondary: colors.neutral200,
  ghost: colors.accent100,
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
        pressed && !disabled && !loading && { backgroundColor: PRESSED_TINT[variant] },
        (disabled || loading) && styles.disabled,
        style,
      ]}
      {...rest}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={variant === "secondary" ? colors.text : colors.accent} />
        ) : (
          <Text
            variant="h3"
            style={styles.label}
            color={variant === "primary" ? colors.surface : variant === "secondary" ? colors.text : colors.accent}
          >
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
    minHeight: 58,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  label: {
    fontSize: 18,
    fontWeight: "700",
  },
  primary: {
    borderWidth: 1,
    borderColor: colors.actionFill,
    backgroundColor: colors.actionFill,
  },
  secondary: {
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: "transparent",
  },
  ghost: {
    borderWidth: 0,
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
