import React from "react";
import { StyleSheet, View, ViewProps } from "react-native";
import { colors, space } from "../theme/tokens";

/** A 1px hairline rule — mirrors styles.css's `.hr`. */
export function Divider({ style, ...rest }: ViewProps) {
  return <View style={[styles.hr, style]} {...rest} />;
}

const styles = StyleSheet.create({
  hr: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: space[4],
  },
});
