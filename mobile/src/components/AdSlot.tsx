import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { formatRupiah, PRO_PRICE_IDR } from "@lapak/shared";
import { Text } from "../theme/Text";
import { colors, radius, space } from "../theme/tokens";
import { useShowsAds } from "../state/api/plan";

/**
 * A monetised slot on the free plan, and nothing at all on Pro.
 *
 * No ad network is wired up — there is no AdMob or equivalent SDK in this
 * project — so rather than mock a filled ad and let the layout lie about
 * revenue that does not exist, the slot renders the one promotion we can
 * honestly serve today: our own upgrade. When a real network is integrated it
 * replaces the body here and the placement/gating around it already holds.
 *
 * Placement rule, which matters more than the creative: these never go in the
 * selling path. Sell, Cart and Paid stay clean. A merchant who looks cheap to
 * their own customer at the counter churns, and the counter is the one moment
 * the app must not compete with the sale.
 */
export type AdPlacement = "home" | "recap";

export interface AdSlotProps {
  placement: AdPlacement;
  onUpgradePress?: () => void;
}

export function AdSlot({ placement, onUpgradePress }: AdSlotProps) {
  const showsAds = useShowsAds();
  if (!showsAds) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Upgrade ke Lapak Pro"
      onPress={onUpgradePress}
      style={styles.card}
      testID={`ad-slot-${placement}`}
    >
      <View style={styles.header}>
        <Text variant="kicker" color={colors.accent700}>
          Lapak Pro
        </Text>
        <Text variant="caption" color={colors.neutral600}>
          {formatRupiah(PRO_PRICE_IDR.monthly)}/bulan
        </Text>
      </View>
      <Text variant="h3" style={styles.headline}>
        Tanya AI sepuasnya, tanpa iklan
      </Text>
      <Text variant="caption" color={colors.neutral600}>
        Rekap harian tiap hari, komisi PPOB penuh, dan kasir tambahan buat yang bantu jaga.
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.accent100,
    borderRadius: radius.md,
    padding: space[4],
    gap: space[2],
  },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  headline: { marginTop: space[1] },
});
