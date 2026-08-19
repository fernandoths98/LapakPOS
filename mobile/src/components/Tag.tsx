import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { Text } from "../theme/Text";
import { colors } from "../theme/tokens";

export type TagVariant = "accent" | "neutral" | "outline";

export interface TagProps extends ViewProps {
  label: string;
  variant?: TagVariant;
}

/** Small label chip — mirrors styles.css's `.tag` variants. */
export function Tag({ label, variant = "neutral", style, ...rest }: TagProps) {
  return (
    <View
      style={[
        styles.base,
        variant === "accent" && styles.accent,
        variant === "neutral" && styles.neutral,
        variant === "outline" && styles.outline,
        style,
      ]}
      {...rest}
    >
      <Text
        variant="caption"
        color={variant === "accent" ? colors.accent800 : variant === "outline" ? colors.accent : colors.neutral800}
        style={styles.text}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignSelf: "flex-start",
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 3,
  },
  text: {
    fontSize: 11,
    letterSpacing: 0.2,
    lineHeight: 15,
  },
  accent: {
    backgroundColor: colors.accent100,
  },
  neutral: {
    backgroundColor: colors.neutral100,
  },
  outline: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.accent,
  },
});
