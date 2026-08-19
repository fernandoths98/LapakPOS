import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { colors, radius, space } from "../theme/tokens";

/** Bordered, unfilled content surface — mirrors styles.css's `.card`. */
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
    padding: space[3],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: "transparent",
  },
});
