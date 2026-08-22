import React from "react";
import { StyleSheet, View } from "react-native";
import { useNetInfo } from "@react-native-community/netinfo";
import { Text } from "../theme/Text";
import { colors, space } from "../theme/tokens";
import { usePendingSalesStore } from "../state/offline/pendingSalesQueue";

/**
 * The one persistent piece of offline-queue UI, per the prototype's phone
 * status bar (`{{ syncLabel }}` — "3 queued · offline"): always mounted at
 * the very top of the app (App.tsx, above NavigationContainer), never
 * tucked into a settings screen. It renders only while offline or while a
 * sale is queued; healthy sync state must not push every screen header down.
 */
export function SyncStatusBar() {
  const netInfo = useNetInfo();
  const pendingCount = usePendingSalesStore((s) => s.items.length);

  // NetInfo can report isInternetReachable as null while it's still
  // figuring that out; treat that as online rather than flashing "offline"
  // on every cold start. Only an explicit false, or isConnected false,
  // counts as offline.
  const isOnline = !!netInfo.isConnected && netInfo.isInternetReachable !== false;

  const { label, tone } = statusFor(pendingCount, isOnline);

  if (pendingCount === 0 && isOnline) return null;

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text variant="caption" color={tone === "attention" ? colors.accent700 : colors.neutral600}>
          {label}
        </Text>
      </View>
    </View>
  );
}

function statusFor(pendingCount: number, isOnline: boolean): { label: string; tone: "attention" | "quiet" } {
  if (pendingCount > 0) {
    return { label: `${pendingCount} queued · ${isOnline ? "syncing" : "offline"}`, tone: "attention" };
  }
  return { label: isOnline ? "Synced" : "Offline", tone: isOnline ? "quiet" : "attention" };
}

const styles = StyleSheet.create({
  container: { backgroundColor: colors.bg, borderBottomWidth: 1, borderBottomColor: colors.divider },
  row: { height: 26, paddingHorizontal: space[4], justifyContent: "center", alignItems: "center" },
});
