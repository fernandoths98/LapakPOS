import React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { formatRupiah, PpobBiller, PpobTransaction } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { colors, radius, space } from "../../theme/tokens";
import { useBillers, usePpobCommissionSummary, usePpobTransactions } from "../../state/api/ppob";
import { BillsStackParamList } from "../../app/stacks/BillsStack";

/** HH:MM from an ISO timestamp, matching the prototype's recent-row "19:04 · ..." format. */
function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function BillsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<BillsStackParamList>>();
  const billersQuery = useBillers();
  const transactionsQuery = usePpobTransactions(20);
  const summaryQuery = usePpobCommissionSummary();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="h2">Bills &amp; top-ups</Text>

      <View style={styles.statRow}>
        <View>
          <Text variant="kicker" style={styles.statLabel}>
            Commission this month
          </Text>
          <Text variant="h2" style={styles.statPrimary}>
            {summaryQuery.data ? formatRupiah(summaryQuery.data.commissionThisMonth) : "—"}
          </Text>
        </View>
        <View style={styles.statRight}>
          <Text variant="kicker" style={styles.statLabel}>
            Deposit
          </Text>
          <Text variant="tabular" color={colors.accent700} style={styles.statSecondary}>
            {summaryQuery.data ? formatRupiah(summaryQuery.data.deposit) : "—"}
          </Text>
        </View>
      </View>
      {summaryQuery.isLoading ? <ActivityIndicator style={styles.loading} color={colors.accent} /> : null}

      <Text variant="kicker" style={styles.sectionLabel}>
        Billers
      </Text>
      {billersQuery.isLoading ? <ActivityIndicator style={styles.loading} color={colors.accent} /> : null}
      {billersQuery.isError ? (
        <Text variant="caption" color={colors.accent700} style={styles.loading}>
          Couldn't load billers. Pull to retry.
        </Text>
      ) : null}
      <View style={styles.grid}>
        {(billersQuery.data ?? []).map((biller) => (
          <BillerTile
            key={biller.id}
            biller={biller}
            onPress={() => navigation.navigate("BillForm", { billerId: biller.id, billerName: biller.name })}
          />
        ))}
      </View>

      <Text variant="kicker" style={styles.sectionLabel}>
        Recent
      </Text>
      {transactionsQuery.isLoading ? <ActivityIndicator style={styles.loading} color={colors.accent} /> : null}
      {(transactionsQuery.data ?? []).length === 0 && !transactionsQuery.isLoading ? (
        <Text variant="body" color={colors.neutral600} style={styles.empty}>
          No bill payments yet.
        </Text>
      ) : null}
      {(transactionsQuery.data ?? []).map((tx) => (
        <RecentRow key={tx.id} transaction={tx} />
      ))}
    </ScrollView>
  );
}

function BillerTile({ biller, onPress }: { biller: PpobBiller; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.tile} accessibilityRole="button">
      <Text variant="h3">{biller.name}</Text>
      <Text variant="caption" color={colors.neutral600} style={styles.tileSub} numberOfLines={1}>
        {biller.sub}
      </Text>
      <Text variant="caption" color={colors.accent700} style={styles.tileMargin}>
        margin {formatRupiah(biller.marginAmount)}
      </Text>
    </Pressable>
  );
}

function RecentRow({ transaction }: { transaction: PpobTransaction }) {
  const isFailed = transaction.status === "failed";
  return (
    <View style={styles.row}>
      <View style={styles.rowBody}>
        <Text variant="body" numberOfLines={1}>
          {transaction.billerName}
        </Text>
        <Text variant="caption" color={colors.neutral600} numberOfLines={1} style={styles.rowMeta}>
          {formatTime(transaction.createdAt)} · {transaction.customerNumber}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        <Text variant="tabular" style={styles.rowAmount}>
          {formatRupiah(transaction.totalCharged)}
        </Text>
        <Text variant="caption" color={colors.accent700}>
          {isFailed ? "Failed" : `+${formatRupiah(transaction.marginAmount)}`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space[4], paddingBottom: space[8] },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginTop: space[3],
    borderTopWidth: 1,
    borderTopColor: colors.text,
    paddingTop: space[2] + 2,
  },
  statRight: { alignItems: "flex-end" },
  statLabel: { marginBottom: 2 },
  statPrimary: { fontSize: 26 },
  statSecondary: { fontSize: 17 },
  loading: { marginTop: space[2] },
  sectionLabel: { marginTop: space[6], marginBottom: space[2] },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space[2] + 1 },
  tile: {
    width: "48%",
    minHeight: 76,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    padding: space[3] - 1,
  },
  tileSub: { marginTop: 3 },
  tileMargin: { marginTop: space[2] - 2 },
  empty: { marginTop: space[2] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space[2] + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowMeta: { marginTop: 2 },
  rowEnd: { alignItems: "flex-end", flexShrink: 0 },
  rowAmount: { fontSize: 14 },
});
