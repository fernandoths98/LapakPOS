import React from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetInfo } from "@react-native-community/netinfo";
import { Text } from "../theme/Text";
import { colors, space } from "../theme/tokens";
import { usePendingSalesStore } from "../state/offline/pendingSalesQueue";

/**
 * The one persistent piece of offline-queue UI, per the prototype's phone
 * status bar (`{{ syncLabel }}` — "3 queued · offline"): always mounted at
 * the very top of the app (App.tsx, above NavigationContainer), never
 * tucked into a settings screen. Copy mirrors the prototype's format when
 * there's something queued; when the queue is empty the bar goes quiet
 * rather than showing a loud permanent "Synced" banner, per this phase's
 * design note — but it stays mounted (a fixed-height sliver) so the layout
 * never jumps as sales enqueue/flush.
 */
export function SyncStatusBar() {
  const insets = useSafeAreaInsets();
  const netInfo = useNetInfo();
  const pendingCount = usePendingSalesStore((s) => s.items.length);

  // NetInfo can report isInternetReachable as null while it's still
  // figuring that out; treat that as online rather than flashing "offline"
  // on every cold start. Only an explicit false, or isConnected false,
  // counts as offline.
  const isOnline = !!netInfo.isConnected && netInfo.isInternetReachable !== false;

  const { label, tone } = statusFor(pendingCount, isOnline);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
  row: { height: 22, paddingHorizontal: space[4], justifyContent: "center", alignItems: "flex-end" },
});
