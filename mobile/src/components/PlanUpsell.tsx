import React from "react";
import { StyleSheet, View } from "react-native";
import { Sparkles } from "lucide-react-native";
import { Text } from "../theme/Text";
import { Button } from "./Button";
import { colors, radius, space } from "../theme/tokens";

/**
 * Shown where the backend returns 402 `plan_limit` — the feature exists but
 * the merchant's plan doesn't include it. `onUpgrade` should route to the
 * Subscription screen.
 */
export function PlanUpsell({
  title,
  message,
  onUpgrade,
}: {
  title: string;
  message: string;
  onUpgrade: () => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.iconWrap}>
        <Sparkles size={20} color={colors.accent2} />
      </View>
      <Text variant="h3" style={styles.title}>{title}</Text>
      <Text variant="caption" color={colors.neutral600} style={styles.msg}>{message}</Text>
      <Button title="Lihat paket" onPress={onUpgrade} style={styles.btn} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    padding: space[6],
    margin: space[4],
    borderWidth: 1,
    borderColor: colors.accent2200,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accent2100,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { marginTop: space[3], textAlign: "center" },
  msg: { marginTop: space[1], textAlign: "center" },
  btn: { marginTop: space[4] },
});
