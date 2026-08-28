import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { ChevronDown, ChevronRight, ChevronUp, History, ScanLine, ShoppingBasket } from "lucide-react-native";
import { formatRupiah, Product } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { BarcodeScanner } from "../../components/BarcodeScanner";
import { colors, radius, shadow, space } from "../../theme/tokens";
import { ALL_CATEGORIES, fetchProductByBarcode, UNCATEGORIZED, useCategories, useProducts } from "../../state/api/products";
import { useCurrentShift } from "../../state/api/shifts";
import { cartCount, cartTotal, useCartStore } from "../../state/cart/cartStore";
import { SellStackParamList } from "../../app/stacks/SellStack";

interface CategoryPillItem {
  id: string;
  label: string;
}

export function SellScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<SellStackParamList>>();
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState(ALL_CATEGORIES);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [cartPreviewOpen, setCartPreviewOpen] = useState(false);
  const { width, height } = useWindowDimensions();
  const isRegisterLayout = width >= 800 && width > height;
  const isPortraitPhone = width < 600 && height >= width;

  const categoriesQuery = useCategories();
  const productsQuery = useProducts({ query, categoryId });
  const currentShiftQuery = useCurrentShift();
  const lines = useCartStore((state) => state.lines);
  const addItem = useCartStore((state) => state.addItem);

  const pills = useMemo<CategoryPillItem[]>(
    () => [
      { id: ALL_CATEGORIES, label: "Semua" },
      ...(categoriesQuery.data?.map((item) => ({ id: item.id, label: item.name })) ?? []),
      { id: UNCATEGORIZED, label: "Tanpa kategori" },
    ],
    [categoriesQuery.data],
  );

  // If the selected category was renamed away or deleted server-side, fall
  // back to "Semua" rather than silently showing an empty catalog.
  useEffect(() => {
    if (categoryId === ALL_CATEGORIES || categoryId === UNCATEGORIZED) return;
    if (categoriesQuery.data && !categoriesQuery.data.some((c) => c.id === categoryId)) {
      setCategoryId(ALL_CATEGORIES);
    }
  }, [categoriesQuery.data, categoryId]);
  const total = cartTotal(lines);
  const count = cartCount(lines);
  const hasCart = count > 0;
  const shift = currentShiftQuery.data?.shift;

  const handleAdd = (product: Product): boolean => {
    const qtyInCart = lines[product.id]?.qty ?? 0;
    if (product.stockQty <= qtyInCart) {
      Alert.alert("Stok tidak cukup", `Stok ${product.name} tersisa ${product.stockQty}.`);
      return false;
    }
    addItem(product);
    return true;
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
      if (handleAdd(product)) {
        setScannerOpen(false);
        setQuery("");
      }
    } catch {
      Alert.alert("Pencarian gagal", "Periksa koneksi lalu coba lagi.");
    }
  };

  const refresh = () => {
    productsQuery.refetch();
    categoriesQuery.refetch();
    currentShiftQuery.refetch();
  };

  const checkout = () => {
    if (!shift) {
      Alert.alert("Buka shift terlebih dahulu", "Saldo awal kas perlu dicatat sebelum transaksi pertama agar laporan kas akurat.", [
        { text: "Nanti", style: "cancel" },
        {
          text: "Buka shift",
          onPress: () => {
            const tabs = navigation.getParent() as unknown as { navigate: (name: string, params: object) => void } | undefined;
            tabs?.navigate("HomeTab", { screen: "OpenShift" });
          },
        },
      ]);
      return;
    }
    navigation.navigate("Cart");
  };

  return (
    <SafeAreaView style={[styles.container, isRegisterLayout && styles.registerLayout]} edges={[]}>
      <View style={[styles.catalogPane, isRegisterLayout && styles.catalogPaneWide]}>
      <FlatList
        data={productsQuery.data ?? []}
        keyExtractor={(item) => item.id}
        numColumns={isRegisterLayout ? 1 : 2}
        key={isRegisterLayout ? "retail-list" : "phone-2"}
        columnWrapperStyle={isRegisterLayout ? undefined : styles.row}
        contentContainerStyle={[
          styles.listContent,
          !isRegisterLayout && hasCart && styles.listContentWithCart,
        ]}
        refreshControl={
          <RefreshControl refreshing={productsQuery.isRefetching} onRefresh={refresh} tintColor={colors.accent} />
        }
        ListHeaderComponent={
          <View style={[styles.header, isPortraitPhone && styles.headerPortrait]}>
            <View style={styles.brandRow}>
              <View>
                <Text variant="h2" style={isPortraitPhone ? styles.titlePortrait : undefined}>
                  {isPortraitPhone ? "Kasir" : "Transaksi Penjualan"}
                </Text>
                <View style={styles.shiftStatus}>
                  <View style={[styles.statusDot, { backgroundColor: shift ? colors.success : colors.warning }]} />
                  <Text variant="caption" color={colors.neutral600}>
                    {shift ? "Kasir aktif" : "Shift belum dibuka"}
                  </Text>
                </View>
              </View>
              <View style={styles.headerActions}>
                <Pressable onPress={() => navigation.navigate("SalesHistory")} style={styles.historyButton} accessibilityLabel="Riwayat penjualan">
                  <History size={18} color={colors.accent2} />
                  {!isPortraitPhone ? <Text variant="caption" color={colors.accent2}>Riwayat</Text> : null}
                </Pressable>
              </View>
            </View>

            <View style={[styles.searchRow, isPortraitPhone && styles.searchRowPortrait]}>
              <View style={styles.searchField}>
                <TextField
                  value={query}
                  onChangeText={setQuery}
                  onSubmitEditing={() => lookupBarcode(query)}
                  placeholder="Scan barcode atau cari nama produk"
                  returnKeyType="search"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {isPortraitPhone ? (
                <Pressable onPress={() => setScannerOpen(true)} style={styles.scanIconButton} accessibilityLabel="Pindai barcode">
                  <ScanLine size={24} color={colors.surface} />
                </Pressable>
              ) : <Button title="Scanner" onPress={() => setScannerOpen(true)} style={styles.scanButton} />}
            </View>

            <FlatList
              data={pills}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={[styles.pillRow, isPortraitPhone && styles.pillRowPortrait]}
              renderItem={({ item }) => (
                <CategoryPill
                  label={item.label}
                  active={item.id === categoryId}
                  onPress={() => setCategoryId(item.id)}
                />
              )}
            />

            <View style={[styles.catalogHeading, isPortraitPhone && styles.catalogHeadingPortrait]}>
              <Text variant="h3">{query.trim() ? "Hasil pencarian" : "Daftar produk"}</Text>
              <Text variant="caption">{productsQuery.data?.length ?? 0} produk</Text>
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
            compact={isRegisterLayout}
            portrait={isPortraitPhone}
          />
        )}
      />
      </View>

      {isRegisterLayout ? (
        <OrderPanel
          lines={Object.values(lines)}
          count={count}
          total={total}
          onBump={(productId, delta) => useCartStore.getState().bump(productId, delta)}
          onClear={() => useCartStore.getState().clear()}
          onCheckout={checkout}
        />
      ) : null}

      {!isRegisterLayout && hasCart ? (
        <>
        {isPortraitPhone && cartPreviewOpen ? (
          <View style={styles.cartPreview}>
            <View style={styles.cartPreviewHeader}>
              <View>
                <Text variant="h3">Keranjang</Text>
                <Text variant="caption">{count} item dalam transaksi</Text>
              </View>
              <Pressable onPress={() => { useCartStore.getState().clear(); setCartPreviewOpen(false); }} style={styles.previewClearButton}>
                <Text variant="caption" color={colors.accent700}>Kosongkan</Text>
              </Pressable>
            </View>
            {Object.values(lines).slice(0, 4).map((line) => (
              <View key={line.productId} style={styles.previewLine}>
                <View style={styles.previewLineInfo}>
                  <Text variant="body" numberOfLines={1} style={styles.previewLineName}>{line.name}</Text>
                  <Text variant="caption">{formatRupiah(line.unitPrice)} / item</Text>
                </View>
                <View style={styles.previewStepper}>
                  <Pressable onPress={() => useCartStore.getState().bump(line.productId, -1)} style={styles.previewStepButton}><Text variant="h3">−</Text></Pressable>
                  <Text variant="tabular" style={styles.previewQty}>{line.qty}</Text>
                  <Pressable onPress={() => useCartStore.getState().bump(line.productId, 1)} style={styles.previewStepButton}><Text variant="h3">+</Text></Pressable>
                </View>
                <Text variant="tabular" style={styles.previewTotal}>{formatRupiah(line.unitPrice * line.qty)}</Text>
              </View>
            ))}
            {Object.keys(lines).length > 4 ? (
              <Pressable onPress={() => navigation.navigate("Cart")} style={styles.previewMoreButton}>
                <Text variant="caption" color={colors.accent2}>Lihat {Object.keys(lines).length - 4} produk lainnya</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        <View style={styles.cartBar}>
          <View style={styles.cartCountBadge}>
            <ShoppingBasket size={19} color={colors.surface} />
            <View style={styles.cartCountBubble}><Text variant="kicker" color={colors.surface}>{count}</Text></View>
          </View>
          <Pressable onPress={() => isPortraitPhone ? setCartPreviewOpen((open) => !open) : navigation.navigate("Cart")} style={styles.cartBarInfo} accessibilityLabel="Lihat isi keranjang">
            <Text variant="caption" color={colors.neutral600}>TOTAL BELANJA</Text>
            <View style={styles.cartTotalRow}>
              <Text variant="h2">{formatRupiah(total)}</Text>
              {isPortraitPhone ? (cartPreviewOpen ? <ChevronDown size={18} color={colors.neutral600} /> : <ChevronUp size={18} color={colors.neutral600} />) : null}
            </View>
          </Pressable>
          <Pressable
            onPress={checkout}
            style={({ pressed }) => [styles.payAction, pressed && styles.payActionPressed]}
            accessibilityRole="button"
            accessibilityLabel={`Bayar ${formatRupiah(total)}`}
          >
            <Text variant="kicker" color={colors.surface} style={styles.payActionLabel}>BAYAR</Text>
            <ChevronRight size={20} strokeWidth={2.4} color={colors.surface} />
          </Pressable>
        </View>
        </>
      ) : null}

      <BarcodeScanner visible={scannerOpen} onScanned={lookupBarcode} onClose={() => setScannerOpen(false)} />
    </SafeAreaView>
  );
}

function OrderPanel({
  lines,
  count,
  total,
  onBump,
  onClear,
  onCheckout,
}: {
  lines: Array<{ productId: string; name: string; unitPrice: number; qty: number }>;
  count: number;
  total: number;
  onBump: (productId: string, delta: number) => void;
  onClear: () => void;
  onCheckout: () => void;
}) {
  return (
    <View style={styles.orderPanel}>
      <View style={styles.orderHeader}>
        <View>
          <Text variant="h2">Daftar Belanja</Text>
          <Text variant="caption">Transaksi baru · Kasir 01 · {count} item</Text>
        </View>
        {lines.length ? (
          <Pressable onPress={onClear} style={styles.clearButton}>
            <Text variant="caption" color={colors.accent700}>Kosongkan</Text>
          </Pressable>
        ) : null}
      </View>

      {lines.length ? (
        <View style={styles.tableHeader}>
          <Text variant="kicker" style={styles.tableProduct}>PRODUK</Text>
          <Text variant="kicker" style={styles.tableQty}>QTY</Text>
          <Text variant="kicker" style={styles.tableAmount}>JUMLAH</Text>
        </View>
      ) : null}
      <FlatList
        data={lines}
        keyExtractor={(item) => item.productId}
        style={styles.orderList}
        contentContainerStyle={lines.length ? styles.orderListContent : styles.orderEmptyContent}
        ListEmptyComponent={
          <View style={styles.orderEmpty}>
            <View style={styles.basketGlyph}><Text variant="h2" color={colors.neutral500}>＋</Text></View>
            <Text variant="h3">Belum ada pesanan</Text>
            <Text variant="caption" style={styles.orderEmptyCaption}>Pindai barcode untuk memulai transaksi, atau pilih produk dari panel pencarian.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.orderLine}>
            <View style={styles.orderLineInfo}>
              <Text variant="body" numberOfLines={1} style={styles.orderLineName}>{item.name}</Text>
              <Text variant="caption">{formatRupiah(item.unitPrice)}</Text>
            </View>
            <View style={styles.miniStepper}>
              <Pressable onPress={() => onBump(item.productId, -1)} style={styles.miniStepButton}><Text variant="h3">−</Text></Pressable>
              <Text variant="tabular" style={styles.miniStepQty}>{item.qty}</Text>
              <Pressable onPress={() => onBump(item.productId, 1)} style={styles.miniStepButton}><Text variant="h3">+</Text></Pressable>
            </View>
            <Text variant="tabular" style={styles.orderLineTotal}>{formatRupiah(item.unitPrice * item.qty)}</Text>
          </View>
        )}
      />

      <View style={styles.orderFooter}>
        <View style={styles.orderTotalRow}>
          <View>
            <Text variant="h3">TOTAL BAYAR</Text>
            <Text variant="caption">{count} item</Text>
          </View>
          <Text variant="h1" style={styles.orderTotal}>{formatRupiah(total)}</Text>
        </View>
        <Button
          title={lines.length ? `BAYAR  ${formatRupiah(total)}` : "SCAN PRODUK UNTUK MULAI"}
          onPress={onCheckout}
          disabled={!lines.length}
          fullWidth
          style={styles.checkoutButton}
        />
      </View>
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

function ProductTile({ product, qtyInCart, onPress, compact = false, portrait = false }: { product: Product; qtyInCart: number; onPress: () => void; compact?: boolean; portrait?: boolean }) {
  const isLow = product.stockQty <= product.lowStockThreshold;
  const soldOut = product.stockQty <= 0;
  return (
    <Pressable
      onPress={onPress}
      disabled={soldOut}
      style={({ pressed }) => [styles.tile, compact && styles.tileCompact, portrait && styles.tilePortrait, pressed && styles.tilePressed, soldOut && styles.tileDisabled]}
      accessibilityRole="button"
    >
      <View style={[styles.tilePhoto, compact && styles.tilePhotoCompact, portrait && styles.tilePhotoPortrait]}>
        {product.imageUrl ? (
          <Image source={{ uri: product.imageUrl }} style={styles.productImage} resizeMode="contain" />
        ) : (
          <Text variant="h2" color={colors.neutral400}>{product.name.charAt(0).toUpperCase()}</Text>
        )}
        {qtyInCart > 0 ? (
          <View style={[styles.qtyBadge, portrait && styles.qtyBadgePortrait]}><Text variant="caption" color={colors.surface}>{portrait ? qtyInCart : `${qtyInCart} di keranjang`}</Text></View>
        ) : null}
      </View>
      <View style={[styles.tileBody, compact && styles.tileBodyCompact, portrait && styles.tileBodyPortrait]}>
        <Text variant="body" style={[styles.tileName, compact && styles.tileNameCompact, portrait && styles.tileNamePortrait]} numberOfLines={compact ? 1 : 2}>{product.name}</Text>
        <Text variant="tabular" color={colors.accent2} style={[styles.tilePrice, portrait && styles.tilePricePortrait]}>{formatRupiah(product.sellPrice)}</Text>
        <View style={[styles.stockRow, compact && styles.stockRowCompact, portrait && styles.stockRowPortrait]}>
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
  registerLayout: { flexDirection: "row" },
  catalogPane: { flex: 1 },
  catalogPaneWide: { flex: 0, width: "37%", borderRightWidth: 1, borderRightColor: colors.divider },
  listContent: { paddingHorizontal: space[3], paddingTop: 0, paddingBottom: space[8] },
  listContentWithCart: { paddingBottom: 100 },
  header: { paddingTop: 0, paddingBottom: space[2] },
  headerPortrait: { paddingTop: 0 },
  titlePortrait: { fontSize: 21, lineHeight: 26 },
  brandRow: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  shiftStatus: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: space[2] },
  historyButton: { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.accent2200, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 8 },
  searchRow: { flexDirection: "row", gap: space[2], marginTop: space[3], alignItems: "center" },
  searchRowPortrait: { marginTop: space[2] },
  searchField: { flex: 1 },
  scanButton: { minHeight: 46, paddingHorizontal: space[3] },
  scanIconButton: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
  pillRow: { gap: space[2], paddingVertical: space[3] },
  pillRowPortrait: { paddingVertical: 10 },
  pill: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  pillActive: { backgroundColor: colors.accent2, borderColor: colors.accent2 },
  pillInactive: { backgroundColor: colors.surface, borderColor: colors.divider },
  pillLabel: { fontWeight: "600" },
  catalogHeading: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: space[2] },
  catalogHeadingPortrait: { marginBottom: space[2] },
  loading: { marginVertical: space[3] },
  row: { gap: space[2] },
  tile: { flex: 1, marginBottom: space[2], borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md, overflow: "hidden", backgroundColor: colors.surface, ...shadow.sm },
  tilePressed: { transform: [{ scale: 0.98 }], borderColor: colors.accent2 },
  tileDisabled: { opacity: 0.55 },
  tileCompact: { flexDirection: "row", minHeight: 68, marginBottom: 6, borderRadius: radius.sm, shadowOpacity: 0, elevation: 0 },
  tilePortrait: { borderRadius: radius.md, shadowOpacity: 0.08, elevation: 1 },
  tilePhoto: { height: 92, backgroundColor: colors.neutral100, alignItems: "center", justifyContent: "center" },
  tilePhotoCompact: { width: 68, height: 68 },
  tilePhotoPortrait: { height: 76 },
  productImage: { width: "100%", height: "100%" },
  qtyBadge: { position: "absolute", right: 6, top: 6, backgroundColor: colors.accent2, borderRadius: 10, paddingHorizontal: 7, paddingVertical: 3 },
  qtyBadgePortrait: { minWidth: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, paddingVertical: 0 },
  tileBody: { padding: 10 },
  tileBodyCompact: { flex: 1, paddingVertical: 7, paddingHorizontal: 10 },
  tileBodyPortrait: { padding: 9 },
  tileName: { minHeight: 40, fontWeight: "600" },
  tileNameCompact: { minHeight: 0 },
  tileNamePortrait: { minHeight: 38, fontSize: 13, lineHeight: 18 },
  tilePrice: { marginTop: 4, fontSize: 16 },
  tilePricePortrait: { marginTop: 2, fontSize: 15 },
  stockRow: { flexDirection: "row", justifyContent: "space-between", gap: 4, marginTop: 6 },
  stockRowCompact: { position: "absolute", right: 10, bottom: 8 },
  stockRowPortrait: { marginTop: 4 },
  emptyState: { alignItems: "center", paddingVertical: space[8] },
  emptyCaption: { marginTop: space[1] },
  cartBar: { position: "absolute", left: space[3], right: space[3], bottom: space[2], minHeight: 64, flexDirection: "row", alignItems: "center", gap: space[3], backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.lg, paddingHorizontal: space[3], paddingVertical: 8, ...shadow.lg },
  cartCountBadge: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.accent2, alignItems: "center", justifyContent: "center" },
  cartCountBubble: { position: "absolute", right: -6, top: -6, minWidth: 19, height: 19, paddingHorizontal: 4, borderRadius: 10, backgroundColor: colors.accent, borderWidth: 2, borderColor: colors.surface, alignItems: "center", justifyContent: "center" },
  cartBarInfo: { flex: 1 },
  cartTotalRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cartPreview: { position: "absolute", left: space[3], right: space[3], bottom: 78, maxHeight: 330, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.lg, paddingHorizontal: space[3], paddingTop: space[3], paddingBottom: space[2], ...shadow.lg },
  cartPreviewHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: space[2], borderBottomWidth: 1, borderBottomColor: colors.divider },
  previewClearButton: { paddingHorizontal: 8, paddingVertical: 6 },
  previewLine: { minHeight: 54, flexDirection: "row", alignItems: "center", gap: 6, borderBottomWidth: 1, borderBottomColor: colors.divider },
  previewLineInfo: { flex: 1, minWidth: 0 },
  previewLineName: { fontWeight: "600", fontSize: 13 },
  previewStepper: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.divider, borderRadius: radius.sm },
  previewStepButton: { width: 28, height: 30, alignItems: "center", justifyContent: "center" },
  previewQty: { width: 22, textAlign: "center", fontSize: 13 },
  previewTotal: { width: 72, textAlign: "right", fontSize: 12 },
  previewMoreButton: { minHeight: 38, alignItems: "center", justifyContent: "center" },
  payAction: { height: 44, minWidth: 100, paddingHorizontal: space[3], borderRadius: radius.sm, backgroundColor: colors.text, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  payActionPressed: { backgroundColor: colors.neutral800, transform: [{ scale: 0.98 }] },
  payActionLabel: { letterSpacing: 1.1 },
  orderPanel: { flex: 1, minWidth: 440, backgroundColor: colors.surface },
  orderHeader: { height: 60, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: space[4], borderBottomWidth: 1, borderBottomColor: colors.divider },
  clearButton: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.accent100 },
  tableHeader: { flexDirection: "row", paddingHorizontal: space[4], paddingVertical: 6, backgroundColor: colors.neutral200, borderBottomWidth: 1, borderBottomColor: colors.divider },
  tableProduct: { flex: 1 },
  tableQty: { width: 86, textAlign: "center" },
  tableAmount: { width: 100, textAlign: "right" },
  orderList: { flex: 1, minHeight: 0 },
  orderListContent: { paddingHorizontal: space[4], paddingBottom: space[2] },
  orderEmptyContent: { flexGrow: 1, justifyContent: "center" },
  orderEmpty: { alignItems: "center", padding: space[6] },
  basketGlyph: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.neutral200, alignItems: "center", justifyContent: "center", marginBottom: space[3] },
  orderEmptyCaption: { textAlign: "center", marginTop: space[1], maxWidth: 230 },
  orderLine: { minHeight: 60, flexDirection: "row", alignItems: "center", gap: space[2], paddingVertical: space[2], borderBottomWidth: 1, borderBottomColor: colors.divider },
  orderLineInfo: { flex: 1, minWidth: 0 },
  orderLineName: { fontWeight: "600" },
  miniStepper: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: colors.divider, borderRadius: radius.sm },
  miniStepButton: { width: 30, height: 32, alignItems: "center", justifyContent: "center" },
  miniStepQty: { width: 24, fontSize: 13, textAlign: "center" },
  orderLineTotal: { width: 86, fontSize: 13, textAlign: "right" },
  orderFooter: { height: 94, flexShrink: 0, paddingHorizontal: space[4], paddingVertical: 4, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.neutral100 },
  orderTotalRow: { height: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  orderTotal: { fontSize: 23, lineHeight: 28 },
  checkoutButton: { minHeight: 38, height: 38, paddingVertical: 4 },
});
