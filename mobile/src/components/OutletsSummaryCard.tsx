import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { formatRupiah } from "@lapak/shared";
import { Text } from "../theme/Text";
import { colors, radius, space } from "../theme/tokens";
import { useEntitlements } from "../state/api/subscription";
import { useOutletReports } from "../state/api/reports";
import { useOutletStore } from "../state/outlet/outletStore";
import { useAuthStore } from "../state/auth/authStore";

/**
 * Home card: every outlet's last-7-day revenue side by side, for owners and
 * managers on a plan with multi-outlet. Tapping a row makes that outlet the
 * active one. Renders nothing when the plan is single-outlet.
 */
export function OutletsSummaryCard() {
  const role = useAuthStore((s) => s.user?.role);
  const entitlements = useEntitlements();
  const enabled = (role === "owner" || role === "manager") && (entitlements.data?.entitlements.multiOutlet ?? false);
  const reports = useOutletReports(7, enabled);
  const activeOutletId = useOutletStore((s) => s.activeOutletId);
  const tokenOutletId = useAuthStore((s) => s.user?.outletId ?? null);
  const setActiveOutlet = useOutletStore((s) => s.setActiveOutlet);
  const queryClient = useQueryClient();

  if (!enabled) return null;

  const rows = reports.data?.rows ?? [];
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  const currentId = activeOutletId ?? tokenOutletId;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text variant="kicker">SEMUA OUTLET · 7 HARI</Text>
        {reports.data ? (
          <Text variant="caption" color={colors.neutral600}>
            {formatRupiah(reports.data.totals.revenue)} · {reports.data.totals.txnCount} trx
          </Text>
        ) : null}
      </View>

      {reports.isLoading ? (
        <ActivityIndicator style={styles.loading} color={colors.accent} />
      ) : rows.length === 0 ? (
        <Text variant="caption" color={colors.neutral600} style={styles.loading}>Belum ada data.</Text>
      ) : (
        rows.map((r) => {
          const isCurrent = r.outletId === currentId;
          return (
            <Pressable
              key={r.outletId}
              onPress={() => {
                setActiveOutlet(r.outletId);
                queryClient.invalidateQueries();
              }}
              style={styles.row}
            >
              <View style={styles.rowTop}>
                <Text variant="body" style={[styles.name, isCurrent && styles.nameCurrent]} numberOfLines={1}>
                  {r.outletName}
                  {r.type === "franchise" ? "  ·  franchise" : ""}
                </Text>
                <Text variant="tabular">{formatRupiah(r.revenue)}</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${Math.round((r.revenue / max) * 100)}%` }]} />
              </View>
              <Text variant="caption" color={colors.neutral600}>
                {r.txnCount} trx · {r.lowStockCount} stok menipis{r.openShift ? " · shift buka" : ""}
              </Text>
            </Pressable>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: space[4],
    padding: space[4],
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
  },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  loading: { marginTop: space[3] },
  row: { marginTop: space[3], gap: 4 },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontWeight: "600", flex: 1, marginRight: space[2] },
  nameCurrent: { color: colors.accent2 },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: colors.neutral200, overflow: "hidden" },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent2 },
});
