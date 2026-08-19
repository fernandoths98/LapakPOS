import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatRupiah, Product } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { BarcodeScanner } from "../../components/BarcodeScanner";
import { colors, radius, space } from "../../theme/tokens";
import { fetchProductByBarcode, useCategories, useProducts } from "../../state/api/products";
import { cartCount, cartTotal, useCartStore } from "../../state/cart/cartStore";
import { SellStackParamList } from "../../app/stacks/SellStack";

const ALL_CATEGORY = "All";

export function SellScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SellStackParamList>>();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORY);
  const [scannerOpen, setScannerOpen] = useState(false);

  const categoriesQuery = useCategories();
  const productsQuery = useProducts({ query, category });

  const lines = useCartStore((s) => s.lines);
  const addItem = useCartStore((s) => s.addItem);

  const pills = useMemo(
    () => [ALL_CATEGORY, ...(categoriesQuery.data?.map((c) => c.name) ?? [])],
    [categoriesQuery.data],
  );

  const total = cartTotal(lines);
  const count = cartCount(lines);
  const hasCart = count > 0;

  const handleScan = () => setScannerOpen(true);

  const handleScanned = async (code: string) => {
    setScannerOpen(false);
    try {
      const product = await fetchProductByBarcode(code);
      if (product) {
        addItem(product);
      } else {
        Alert.alert("Not found", `No product with barcode ${code}.`);
      }
    } catch {
      Alert.alert("Lookup failed", "Couldn't look up that barcode. Check your connection and try again.");
    }
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={productsQuery.data ?? []}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={[styles.listContent, hasCart && { paddingBottom: 96 + insets.bottom }]}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Text variant="h2">Sell</Text>
              <Button title="Scan" variant="primary" onPress={handleScan} style={styles.scanButton} />
            </View>

            <TextField
              value={query}
              onChangeText={setQuery}
              placeholder="Search or type a barcode"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.search}
            />

            <FlatList
              data={pills}
              keyExtractor={(item) => item}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}
              renderItem={({ item }) => (
                <CategoryPill label={item} active={item === category} onPress={() => setCategory(item)} />
              )}
            />

            {productsQuery.isLoading ? <ActivityIndicator style={styles.loading} color={colors.accent} /> : null}
            {productsQuery.isError ? (
              <Text variant="caption" color={colors.accent700} style={styles.loading}>
                Couldn't load products. Pull to retry.
              </Text>
            ) : null}
          </View>
        }
        renderItem={({ item }) => <ProductTile product={item} onPress={() => addItem(item)} />}
      />

      {hasCart ? (
        <View style={[styles.cartBar, { paddingBottom: Math.max(space[4], insets.bottom) }]}>
          <View style={styles.cartBarInfo}>
            <Text variant="kicker">{count} items</Text>
            <Text variant="h2" style={styles.cartBarTotal}>
              {formatRupiah(total)}
            </Text>
          </View>
          <Button title="Charge" onPress={() => navigation.navigate("Cart")} />
        </View>
      ) : null}

      <BarcodeScanner visible={scannerOpen} onScanned={handleScanned} onClose={() => setScannerOpen(false)} />
    </View>
  );
}

function CategoryPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.pill, active ? styles.pillActive : styles.pillInactive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text variant="kicker" style={styles.pillLabel} color={active ? colors.accent700 : colors.neutral700}>
        {label}
      </Text>
    </Pressable>
  );
}

function ProductTile({ product, onPress }: { product: Product; onPress: () => void }) {
  const isLow = product.stockQty <= product.lowStockThreshold;
  return (
    <Pressable onPress={onPress} style={styles.tile} accessibilityRole="button">
      <View style={styles.tilePhoto}>
        <Text variant="h2" color={colors.neutral500}>
          {product.name.charAt(0)}
        </Text>
      </View>
      <View style={styles.tileBody}>
        <Text variant="body" style={styles.tileName} numberOfLines={2}>
          {product.name}
        </Text>
        <View style={styles.tileFooter}>
          <Text variant="tabular" style={styles.tilePrice}>
            {formatRupiah(product.sellPrice)}
          </Text>
          <Text
            variant="caption"
            color={isLow ? colors.accent700 : colors.neutral600}
            style={styles.tileStock}
            numberOfLines={1}
          >
            {isLow ? `${product.stockQty} left` : `${product.stockQty} in stock`}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingHorizontal: space[4], paddingBottom: space[8] },
  header: { paddingTop: space[3], paddingBottom: space[2] },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scanButton: { paddingHorizontal: space[3], minHeight: 38 },
  search: { marginTop: space[3] },
  pillRow: { gap: space[2], marginTop: space[3], paddingVertical: 2 },
  pill: {
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  pillActive: { backgroundColor: "rgba(182, 130, 53, 0.14)", borderColor: colors.accent },
  pillInactive: { backgroundColor: "transparent", borderColor: colors.divider },
  pillLabel: { textTransform: "none", letterSpacing: 0.2 },
  loading: { marginTop: space[3] },
  row: { gap: space[2] },
  tile: {
    flex: 1,
    marginBottom: space[2],
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: "transparent",
  },
  tilePhoto: {
    height: 66,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    alignItems: "center",
    justifyContent: "center",
  },
  tileBody: { paddingHorizontal: 10, paddingTop: 9, paddingBottom: 11 },
  tileName: { minHeight: 35 },
  tileFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 5,
    marginTop: 4,
  },
  tilePrice: { fontSize: 14.5 },
  tileStock: { flexShrink: 1, textAlign: "right" },
  cartBar: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.text,
    paddingHorizontal: space[4],
    paddingTop: space[3],
  },
  cartBarInfo: { flex: 1 },
  cartBarTotal: { marginTop: 2 },
});
