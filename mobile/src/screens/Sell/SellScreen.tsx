import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatRupiah, Product } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { BarcodeScanner } from "../../components/BarcodeScanner";
import { colors, radius, shadow, space } from "../../theme/tokens";
import { fetchProductByBarcode, useCategories, useProducts } from "../../state/api/products";
import { useCurrentShift } from "../../state/api/shifts";
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
  const currentShiftQuery = useCurrentShift();
  const lines = useCartStore((state) => state.lines);
  const addItem = useCartStore((state) => state.addItem);

  const pills = useMemo(
    () => [ALL_CATEGORY, ...(categoriesQuery.data?.map((item) => item.name) ?? [])],
    [categoriesQuery.data],
  );
  const total = cartTotal(lines);
  const count = cartCount(lines);
  const hasCart = count > 0;
  const shift = currentShiftQuery.data?.shift;

  const handleAdd = (product: Product) => {
    const qtyInCart = lines[product.id]?.qty ?? 0;
    if (product.stockQty <= qtyInCart) {
      Alert.alert("Stok tidak cukup", `Stok ${product.name} tersisa ${product.stockQty}.`);
      return;
    }
    addItem(product);
  };

  const lookupBarcode = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) return;
    try {
      const product = await fetchProductByBarcode(code);
      if (!product) {
        Alert.alert("Produk tidak ditemukan", `Barcode ${code} belum terdaftar.`);
        return;
      }
      handleAdd(product);
      setQuery("");
    } catch {
      Alert.alert("Pencarian gagal", "Periksa koneksi lalu coba lagi.");
    }
  };

  const refresh = () => {
    productsQuery.refetch();
    categoriesQuery.refetch();
    currentShiftQuery.refetch();
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={productsQuery.data ?? []}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={[styles.listContent, hasCart && { paddingBottom: 104 + insets.bottom }]}
        refreshControl={
          <RefreshControl refreshing={productsQuery.isRefetching} onRefresh={refresh} tintColor={colors.accent} />
        }
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.brandRow}>
              <View>
                <Text variant="h2">Kotdee POS</Text>
                <View style={styles.shiftStatus}>
                  <View style={[styles.statusDot, { backgroundColor: shift ? colors.success : colors.warning }]} />
                  <Text variant="caption" color={colors.neutral600}>
                    {shift ? "Kasir aktif" : "Shift belum dibuka"}
                  </Text>
                </View>
              </View>
              <View style={styles.registerBadge}>
                <Text variant="kicker" color={colors.accent2}>KASIR 01</Text>
              </View>
            </View>

            <View style={styles.searchRow}>
              <View style={styles.searchField}>
                <TextField
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={() => lookupBarcode(query)}
                  placeholder="Cari nama / masukkan barcode"
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              <Button title="Scan" onPress={() => setScannerOpen(true)} style={styles.scanButton} />
            </View>

            <FlatList
              data={pills}
              keyExtractor={(item) => item}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.pillRow}
              renderItem={({ item }) => (
                <CategoryPill
                  label={item === ALL_CATEGORY ? "Semua" : item}
                  active={item === category}
                  onPress={() => setCategory(item)}
                />
              )}
            />

            <View style={styles.catalogHeading}>
              <Text variant="h3">Daftar produk</Text>
              <Text variant="caption">Ketuk produk untuk menambah</Text>
            </View>
            {productsQuery.isLoading ? <ActivityIndicator style={styles.loading} color={colors.accent} /> : null}
            {productsQuery.isError ? (
              <Text variant="caption" color={colors.accent} style={styles.loading}>
                Produk gagal dimuat. Tarik layar untuk mencoba lagi.
              </Text>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          !productsQuery.isLoading ? (
            <View style={styles.emptyState}>
              <Text variant="h3">Produk tidak ditemukan</Text>
              <Text variant="caption" style={styles.emptyCaption}>Coba kata kunci atau kategori lain.</Text>
            </View>
          ) : undefined
        }
        renderItem={({ item }) => (
          <ProductTile
            product={item}
            qtyInCart={lines[item.id]?.qty ?? 0}
            onPress={() => handleAdd(item)}
          />
        )}
      />

      {hasCart ? (
        <View style={[styles.cartBar, { paddingBottom: Math.max(space[3], insets.bottom) }]}>
          <View style={styles.cartCountBadge}>
            <Text variant="h3" color={colors.surface}>{count}</Text>
          </View>
          <View style={styles.cartBarInfo}>
            <Text variant="caption" color={colors.neutral600}>TOTAL BELANJA</Text>
            <Text variant="h2">{formatRupiah(total)}</Text>
          </View>
          <Button title="Bayar →" onPress={() => navigation.navigate("Cart")} style={styles.payButton} />
        </View>
      ) : null}

      <BarcodeScanner visible={scannerOpen} onScanned={lookupBarcode} onClose={() => setScannerOpen(false)} />
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
      <Text variant="caption" color={active ? colors.surface : colors.neutral700} style={styles.pillLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

function ProductTile({ product, qtyInCart, onPress }: { product: Product; qtyInCart: number; onPress: () => void }) {
  const isLow = product.stockQty <= product.lowStockThreshold;
  const soldOut = product.stockQty <= 0;
  return (
    <Pressable
      onPress={onPress}
      disabled={soldOut}
      style={({ pressed }) => [styles.tile, pressed && styles.tilePressed, soldOut && styles.tileDisabled]}
      accessibilityRole="button"
    >
      <View style={styles.tilePhoto}>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={styles.productImage} resizeMode="contain" />
        ) : (
          <Text variant="h2" color={colors.neutral400}>{product.name.charAt(0).toUpperCase()}</Text>
        )}
        {qtyInCart > 0 ? (
          <View style={styles.qtyBadge}><Text variant="caption" color={colors.surface}>{qtyInCart} di keranjang</Text></View>
        ) : null}
      </View>
      <View style={styles.tileBody}>
        <Text variant="body" style={styles.tileName} numberOfLines={2}>{product.name}</Text>
        <Text variant="tabular" color={colors.accent2} style={styles.tilePrice}>{formatRupiah(product.sellPrice)}</Text>
        <View style={styles.stockRow}>
          <Text variant="caption" color={soldOut || isLow ? colors.accent : colors.neutral600}>
            {soldOut ? "Stok habis" : `Stok ${product.stockQty}`}
          </Text>
          {product.barcode ? <Text variant="caption" color={colors.neutral500}>#{product.barcode.slice(-6)}</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  listContent: { paddingHorizontal: space[3], paddingBottom: space[8] },
  header: { paddingTop: space[3], paddingBottom: space[2] },
  brandRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  shiftStatus: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  registerBadge: { backgroundColor: colors.accent2100, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8 },
  searchRow: { flexDirection: "row", gap: space[2], marginTop: space[3], alignItems: "center" },
  searchField: { flex: 1 },
  scanButton: { minHeight: 46, paddingHorizontal: space[3] },
  pillRow: { gap: space[2], paddingVertical: space[3] },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  pillActive: { backgroundColor: colors.accent2, borderColor: colors.accent2 },
  pillInactive: { backgroundColor: colors.surface, borderColor: colors.divider },
  pillLabel: { fontWeight: "600" },
  catalogHeading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: space[2] },
  loading: { marginVertical: space[3] },
  row: { gap: space[2] },
  tile: { flex: 1, marginBottom: space[2], borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surface, ...shadow.sm },
  tilePressed: { transform: [{ scale: 0.98 }], borderColor: colors.accent2 },
  tileDisabled: { opacity: 0.55 },
  tilePhoto: { height: 92, backgroundColor: colors.neutral100, alignItems: "center", justifyContent: "center" },
  productImage: { width: "100%", height: "100%" },
  qtyBadge: { position: "absolute", right: 6, top: 6, backgroundColor: colors.accent2, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  tileBody: { padding: 10 },
  tileName: { minHeight: 40, fontWeight: "600" },
  tilePrice: { marginTop: 4, fontSize: 16 },
  stockRow: { flexDirection: "row", justifyContent: "space-between", gap: 4, marginTop: 6 },
  emptyState: { alignItems: "center", paddingVertical: space[8] },
  emptyCaption: { marginTop: space[1] },
  cartBar: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: space[3], backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider, paddingHorizontal: space[3], paddingTop: space[3], ...shadow.lg },
  cartCountBadge: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.accent2, alignItems: "center", justifyContent: "center" },
  cartBarInfo: { flex: 1 },
  payButton: { minHeight: 46, paddingHorizontal: space[4] },
});
