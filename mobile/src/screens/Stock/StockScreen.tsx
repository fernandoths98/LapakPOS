import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatRupiah, Product } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { colors, space } from "../../theme/tokens";
import { useProducts } from "../../state/api/products";
import { StockStackParamList } from "../../app/stacks/StockStack";

export function StockScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StockStackParamList>>();
  const [query, setQuery] = useState("");

  // Stats (SKU count / low count / inventory value) are computed from the
  // full unfiltered catalog, matching the prototype's stat strip which
  // never changes with the list's own search. The visible rows below use
  // the same live query, filtered by `query`.
  const allProductsQuery = useProducts({});
  const filteredQuery = useProducts({ query });

  const stats = useMemo(() => {
    const products = allProductsQuery.data ?? [];
    const skuCount = products.length;
    const lowCount = products.filter((p) => p.stockQty <= p.lowStockThreshold).length;
    const value = products.reduce((sum, p) => sum + p.sellPrice * p.stockQty, 0);
    return { skuCount, lowCount, value };
  }, [allProductsQuery.data]);

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <FlatList
        data={filteredQuery.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text variant="h2">Stock</Text>
              <View style={styles.headerButtons}>
                <Button
                  title="Stok outlet"
                  variant="secondary"
                  onPress={() => navigation.navigate("OutletInventory")}
                  style={styles.headerButton}
                />
                <Button
                  title="Excel"
                  variant="secondary"
                  onPress={() => navigation.navigate("Sheet")}
                  style={styles.headerButton}
                />
                <Button
                  title="+ Product"
                  onPress={() => navigation.navigate("Product", undefined)}
                  style={styles.headerButton}
                />
              </View>
            </View>

            <View style={styles.statStrip}>
              <StatItem label="SKUs" value={String(stats.skuCount)} />
              <StatItem label="Low" value={String(stats.lowCount)} color={colors.accent700} />
              <StatItem label="Value" value={formatRupiah(stats.value)} />
            </View>

            <TextField
              value={query}
              onChangeText={setQuery}
              placeholder="Search the catalog"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.search}
            />

            {filteredQuery.isLoading ? <ActivityIndicator style={styles.loading} color={colors.accent} /> : null}
            {filteredQuery.isError ? (
              <Text variant="caption" color={colors.accent700} style={styles.loading}>
                Couldn't load the catalog. Pull to retry.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <CatalogRow product={item} onPress={() => navigation.navigate("Product", { productId: item.id })} />
        )}
        ListEmptyComponent={
          !filteredQuery.isLoading ? (
            <Text variant="body" color={colors.neutral600} style={styles.empty}>
              No products match "{query}".
            </Text>
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statItem}>
      <Text variant="kicker" style={styles.statLabel}>
        {label}
      </Text>
      <Text variant="h3" color={color ?? colors.text} style={styles.statValue}>
        {value}
      </Text>
    </View>
  );
}

function CatalogRow({ product, onPress }: { product: Product; onPress: () => void }) {
  const isLow = product.stockQty <= product.lowStockThreshold;
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button">
      <View style={styles.rowTile}>
        <Text variant="h3" color={colors.neutral600}>
          {product.name.charAt(0).toUpperCase()}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <Text variant="body" numberOfLines={1}>
          {product.name}
        </Text>
        <Text variant="caption" style={styles.rowMeta} numberOfLines={1}>
          {product.categoryName ?? "Uncategorized"}
          {product.barcode ? ` · ${product.barcode}` : ""}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        <Text variant="tabular" style={styles.rowPrice}>
          {formatRupiah(product.sellPrice)}
        </Text>
        <Text variant="caption" color={isLow ? colors.accent700 : colors.neutral600}>
          {isLow ? `${product.stockQty} left` : `${product.stockQty} in stock`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingHorizontal: space[4], paddingTop: 0, paddingBottom: space[8] },
  header: { paddingTop: 0, paddingBottom: space[2] },
  titleRow: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerButtons: { flexDirection: "row", gap: space[2] },
  headerButton: { paddingHorizontal: space[3], minHeight: 38 },
  statStrip: {
    flexDirection: "row",
    gap: space[6],
    marginTop: space[3],
    borderTopWidth: 1,
    borderTopColor: colors.text,
    paddingTop: space[2],
  },
  statItem: {},
  statLabel: { marginBottom: 2 },
  statValue: { fontSize: 19 },
  search: { marginTop: space[3] },
  loading: { marginTop: space[3] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[2] + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  rowTile: {
    width: 38,
    height: 38,
    flexShrink: 0,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowMeta: { marginTop: 2 },
  rowEnd: { alignItems: "flex-end", flexShrink: 0 },
  rowPrice: { fontSize: 14 },
  empty: { textAlign: "center", marginTop: space[6] },
});
