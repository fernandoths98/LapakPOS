import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { colors, radius, shadow, space } from "../theme/tokens";

/** White, softly lifted content surface. */
export function Card({ style, children, ...rest }: ViewProps) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "column",
    gap: space[2],
    padding: space[4],
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    ...shadow.sm,
  },
});
