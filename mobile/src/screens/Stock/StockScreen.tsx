import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { Boxes, FileSpreadsheet, Plus, type LucideIcon } from "lucide-react-native";
import { formatRupiah, Product } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { TextField } from "../../components/TextField";
import { colors, radius, space } from "../../theme/tokens";
import { useProducts } from "../../state/api/products";
import { StockStackParamList } from "../../app/stacks/StockStack";

export function StockScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StockStackParamList>>();
  const [query, setQuery] = useState("");

  // Stats are from the full unfiltered catalog; the visible rows use the
  // same live query, filtered by `query`.
  const allProductsQuery = useProducts({});
  const filteredQuery = useProducts({ query });

  const stats = useMemo(() => {
    const products = allProductsQuery.data ?? [];
    return {
      skuCount: products.length,
      lowCount: products.filter((p) => p.stockQty <= p.lowStockThreshold).length,
      value: products.reduce((sum, p) => sum + p.sellPrice * p.stockQty, 0),
    };
  }, [allProductsQuery.data]);

  return (
    <SafeAreaView style={styles.container} edges={[]}>
      <FlatList
        data={filteredQuery.data ?? []}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text variant="h2" style={styles.title}>Stok</Text>

            <View style={styles.actionRow}>
              <ActionButton icon={Boxes} label="Stok outlet" onPress={() => navigation.navigate("OutletInventory")} />
              <ActionButton icon={FileSpreadsheet} label="Excel" onPress={() => navigation.navigate("Sheet")} />
              <ActionButton icon={Plus} label="Produk baru" primary onPress={() => navigation.navigate("Product", undefined)} />
            </View>

            <View style={styles.statStrip}>
              <StatItem label="SKU" value={String(stats.skuCount)} />
              <StatItem label="Menipis" value={String(stats.lowCount)} color={stats.lowCount > 0 ? colors.accent700 : colors.text} />
              <StatItem label="Nilai stok" value={formatRupiah(stats.value)} />
            </View>

            <TextField
              value={query}
              onChangeText={setQuery}
              placeholder="Cari produk"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.search}
            />

            {filteredQuery.isLoading ? <ActivityIndicator style={styles.loading} color={colors.accent} /> : null}
            {filteredQuery.isError ? (
              <Text variant="caption" color={colors.accent700} style={styles.loading}>
                Katalog gagal dimuat. Tarik untuk mencoba lagi.
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
              {query ? `Tidak ada produk yang cocok dengan "${query}".` : "Belum ada produk."}
            </Text>
          ) : undefined
        }
      />
    </SafeAreaView>
  );
}

function ActionButton({
  icon: Icon,
  label,
  onPress,
  primary = false,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.action, primary && styles.actionPrimary, pressed && styles.actionPressed]}
      accessibilityRole="button"
    >
      <Icon size={17} color={primary ? colors.surface : colors.accent2} />
      <Text variant="caption" color={primary ? colors.surface : colors.text} style={styles.actionLabel}>{label}</Text>
    </Pressable>
  );
}

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.statItem}>
      <Text variant="kicker" style={styles.statLabel}>{label}</Text>
      <Text variant="h3" color={color ?? colors.text} style={styles.statValue}>{value}</Text>
    </View>
  );
}

function CatalogRow({ product, onPress }: { product: Product; onPress: () => void }) {
  const isLow = product.stockQty <= product.lowStockThreshold;
  const soldOut = product.stockQty <= 0;
  return (
    <Pressable onPress={onPress} style={styles.row} accessibilityRole="button">
      <View style={styles.rowTile}>
        <Text variant="h3" color={colors.neutral500}>{product.name.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text variant="body" numberOfLines={1} style={styles.rowName}>{product.name}</Text>
        <Text variant="caption" style={styles.rowMeta} numberOfLines={1}>
          {product.categoryName ?? "Tanpa kategori"}
          {product.barcode ? ` · ${product.barcode}` : ""}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        <Text variant="tabular" style={styles.rowPrice}>{formatRupiah(product.sellPrice)}</Text>
        <Text variant="caption" color={soldOut || isLow ? colors.accent700 : colors.neutral600}>
          {soldOut ? "Stok habis" : `${product.stockQty} stok`}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingHorizontal: space[4], paddingTop: 0, paddingBottom: space[8] },
  header: { paddingTop: space[2], paddingBottom: space[2] },
  title: { marginBottom: space[3] },
  actionRow: { flexDirection: "row", gap: space[2] },
  action: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
    paddingHorizontal: 4,
  },
  actionPrimary: { backgroundColor: colors.accent2, borderColor: colors.accent2 },
  actionPressed: { transform: [{ scale: 0.98 }] },
  actionLabel: { fontWeight: "600" },
  statStrip: {
    flexDirection: "row",
    gap: space[6],
    marginTop: space[4],
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
    borderRadius: radius.sm,
    backgroundColor: colors.neutral100,
    borderWidth: 1,
    borderColor: colors.divider,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowName: { fontWeight: "600" },
  rowMeta: { marginTop: 2 },
  rowEnd: { alignItems: "flex-end", flexShrink: 0 },
  rowPrice: { fontSize: 14 },
  empty: { textAlign: "center", marginTop: space[6] },
});
