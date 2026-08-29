import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ChevronRight, Clock, Sparkles } from "lucide-react-native";
import { trialDaysLeft } from "@lapak/shared";
import { Text } from "../theme/Text";
import { colors, radius, space } from "../theme/tokens";
import { useEntitlements } from "../state/api/subscription";
import { HomeStackParamList } from "../app/stacks/HomeStack";

/**
 * Slim banner on Home for the 14-day Starter trial: a countdown while it runs
 * (`status: "trialing"`), then a "trial ended, you're on Free now" nudge once
 * the backend has lapsed it (`status: "canceled"` with a `trialEndsAt` still
 * on record). Renders nothing for a paid or long-settled free account.
 */
export function TrialBanner() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const { data } = useEntitlements();
  if (!data || !data.trialEndsAt) return null;

  const goToPlans = () => navigation.navigate("Subscription");

  if (data.status === "trialing") {
    const days = trialDaysLeft(data.trialEndsAt);
    return (
      <Pressable onPress={goToPlans} style={[styles.banner, styles.trialing]} accessibilityRole="button">
        <Sparkles size={17} color={colors.accent2} />
        <View style={styles.body}>
          <Text variant="body" style={styles.title} color={colors.accent2}>
            Masa uji Starter{days > 0 ? ` · ${days} hari lagi` : " berakhir hari ini"}
          </Text>
          <Text variant="caption" color={colors.neutral600}>
            Semua fitur Starter aktif. Ketuk untuk berlangganan.
          </Text>
        </View>
        <ChevronRight size={17} color={colors.accent2} />
      </Pressable>
    );
  }

  if (data.status === "canceled") {
    return (
      <Pressable onPress={goToPlans} style={[styles.banner, styles.ended]} accessibilityRole="button">
        <Clock size={17} color={colors.warning} />
        <View style={styles.body}>
          <Text variant="body" style={styles.title} color={colors.text}>
            Masa uji Starter berakhir
          </Text>
          <Text variant="caption" color={colors.neutral600}>
            Sekarang paket Gratis — upgrade untuk buka batasnya lagi.
          </Text>
        </View>
        <Text variant="caption" color={colors.accent2}>Upgrade</Text>
      </Pressable>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2] + 2,
    borderRadius: radius.md,
    padding: space[3],
    marginBottom: space[3],
  },
  trialing: { backgroundColor: colors.accent2100 },
  ended: { backgroundColor: "#FFF6DF" },
  body: { flex: 1 },
  title: { fontWeight: "600" },
});
