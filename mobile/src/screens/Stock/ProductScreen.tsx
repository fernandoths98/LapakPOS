import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { launchCamera, launchImageLibrary } from "react-native-image-picker";
import { Camera } from "lucide-react-native";
import { parseRupiah } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { BarcodeScanner } from "../../components/BarcodeScanner";
import { colors, radius, space } from "../../theme/tokens";
import { API_BASE_URL } from "../../state/api/apiClient";
import {
  fetchProductByBarcode,
  useCategories,
  useCreateProduct,
  useProduct,
  useUpdateProduct,
  useUploadProductPhoto,
} from "../../state/api/products";
import { StockStackParamList } from "../../app/stacks/StockStack";

function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message ?? fallback;
}

interface FormErrors {
  name?: string;
  sellPrice?: string;
  costPrice?: string;
  stockQty?: string;
}

export function ProductScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<StockStackParamList>>();
  const route = useRoute<RouteProp<StockStackParamList, "Product">>();
  const productId = route.params?.productId;
  const isEditing = !!productId;

  const productQuery = useProduct(productId);
  const categoriesQuery = useCategories();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const uploadPhoto = useUploadProductPhoto();

  const [name, setName] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [sellPrice, setSellPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [stockQty, setStockQty] = useState("");
  const [barcode, setBarcode] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [barcodeNote, setBarcodeNote] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Prefills the form once the real product loads — the prototype's mocked
  // "Kopi Susu Gula Aren" example is placeholder state only; a real Add form
  // starts blank and a real Edit form loads the actual record.
  useEffect(() => {
    const product = productQuery.data;
    if (!product) return;
    setName(product.name);
    setCategoryId(product.categoryId);
    setSellPrice(String(product.sellPrice));
    setCostPrice(String(product.costPrice));
    setStockQty(String(product.stockQty));
    setBarcode(product.barcode ?? "");
    setImageUrl(product.imageUrl);
  }, [productQuery.data]);

  const sellPriceNum = parseRupiah(sellPrice);
  const costPriceNum = parseRupiah(costPrice);
  const marginHint =
    sellPrice && costPrice && sellPriceNum > 0
      ? `Untung ${Math.round(((sellPriceNum - costPriceNum) / sellPriceNum) * 100)}% dari harga jual`
      : "Isi harga jual dan modal untuk melihat untungnya";

  /**
   * Opens the camera or gallery. Returns `null` when the user cancels (a
   * normal, silent outcome); throws with a plain message on any other failure.
   */
  const pickImage = async (source: "camera" | "library"): Promise<{ imageBase64: string; mimeType: string } | null> => {
    const options = { mediaType: "photo" as const, includeBase64: true, quality: 0.7 as const };
    const result = source === "camera" ? await launchCamera(options) : await launchImageLibrary(options);

    if (result.didCancel) return null;
    if (result.errorMessage) {
      throw new Error(result.errorMessage);
    }
    const asset = result.assets?.[0];
    if (!asset?.base64) {
      throw new Error("Foto tidak terbaca. Coba pilih foto lain.");
    }
    return { imageBase64: asset.base64, mimeType: asset.type ?? "image/jpeg" };
  };

  const handlePickPhoto = () => {
    Alert.alert("Foto produk", "Ambil foto baru atau pilih dari galeri.", [
      { text: "Kamera", onPress: () => pickPhoto("camera") },
      { text: "Galeri", onPress: () => pickPhoto("library") },
      { text: "Batal", style: "cancel" },
    ]);
  };

  const pickPhoto = async (source: "camera" | "library") => {
    let picked: { imageBase64: string; mimeType: string } | null;
    try {
      picked = await pickImage(source);
    } catch (err) {
      Alert.alert("Gagal mengambil foto", err instanceof Error ? err.message : "Coba lagi.");
      return;
    }
    if (!picked) return;

    try {
      const uploaded = await uploadPhoto.mutateAsync(picked);
      setImageUrl(uploaded.imageUrl);
    } catch {
      Alert.alert("Gagal mengunggah foto", "Periksa internet lalu coba lagi.");
    }
  };

  const handleScanBarcode = () => setScannerOpen(true);

  const handleScanned = async (code: string) => {
    setScannerOpen(false);
    setBarcode(code);
    setBarcodeNote(null);
    try {
      const existing = await fetchProductByBarcode(code);
      if (existing && existing.id !== productId) {
        setBarcodeNote(`Barcode ini sudah dipakai "${existing.name}". Ganti barcode-nya supaya bisa disimpan.`);
      }
    } catch {
      // Best-effort duplicate check; a failed lookup shouldn't block filling the field.
    }
  };

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (!name.trim()) next.name = "Nama produk wajib diisi";
    if (sellPrice === "" || sellPriceNum < 0) next.sellPrice = "Isi harga jual";
    if (costPrice === "" || costPriceNum < 0) next.costPrice = "Isi harga modal (boleh 0)";
    if (stockQty === "" || parseRupiah(stockQty) < 0) next.stockQty = "Isi jumlah stok (boleh 0)";
    return next;
  };

  const handleSave = async () => {
    const validationErrors = validate();
    setErrors(validationErrors);
    setSubmitError(null);
    if (Object.keys(validationErrors).length > 0) return;

    const body = {
      name: name.trim(),
      categoryId,
      sellPrice: sellPriceNum,
      costPrice: costPriceNum,
      stockQty: parseRupiah(stockQty),
      barcode: barcode.trim() || null,
      imageUrl,
    };

    try {
      if (isEditing && productId) {
        await updateProduct.mutateAsync({ id: productId, body });
      } else {
        await createProduct.mutateAsync(body);
      }
      navigation.goBack();
    } catch (err) {
      setSubmitError(extractErrorMessage(err, "Produk gagal disimpan. Periksa internet lalu coba lagi."));
    }
  };

  const isSaving = createProduct.isPending || updateProduct.isPending;
  const photoUri = imageUrl ? `${API_BASE_URL}${imageUrl}` : null;

  if (isEditing && productQuery.isLoading) {
    return (
      <SafeAreaView style={styles.loadingContainer} edges={[]}>
        <ActivityIndicator color={colors.accent} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={[]}>
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >
      <Text variant="h2">{isEditing ? "Ubah produk" : "Produk baru"}</Text>

      <View style={styles.photoRow}>
        <PhotoBox onPress={handlePickPhoto} loading={uploadPhoto.isPending} photoUri={photoUri} />

        <View style={styles.photoSideCol}>
          <Text variant="body" color={colors.neutral700}>Foto membantu kasir menemukan barang lebih cepat.</Text>
          <Button title="Pindai barcode" variant="secondary" onPress={handleScanBarcode} />
        </View>
      </View>

      <View style={styles.fields}>
        <TextField
          label="Nama produk"
          value={name}
          onChangeText={setName}
          placeholder="Contoh: Gramoxone 1 Liter"
          error={errors.name}
        />

        <View>
          <Text variant="kicker" style={styles.categoryLabel}>Kategori</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryRow}
          >
            <CategoryChip label="Tanpa kategori" active={categoryId === null} onPress={() => setCategoryId(null)} />
            {(categoriesQuery.data ?? []).map((c) => (
              <CategoryChip
                key={c.id}
                label={c.name}
                active={categoryId === c.id}
                onPress={() => setCategoryId(c.id)}
              />
            ))}
          </ScrollView>
        </View>

        <View>
          <TextField
            label="Harga jual"
            value={sellPrice}
            onChangeText={setSellPrice}
            placeholder="0"
            keyboardType="numeric"
            error={errors.sellPrice}
          />
          {!errors.sellPrice ? (
            <Text variant="caption" color={colors.neutral600} style={styles.hint}>
              {marginHint}
            </Text>
          ) : null}
        </View>

        <View>
          <TextField
            label="Harga modal"
            value={costPrice}
            onChangeText={setCostPrice}
            placeholder="0"
            keyboardType="numeric"
            error={errors.costPrice}
          />
          {!errors.costPrice ? (
            <Text variant="caption" color={colors.neutral600} style={styles.hint}>
              {isEditing ? "Perubahan harga modal dicatat di riwayat" : "Harga beli dari supplier"}
            </Text>
          ) : null}
        </View>

        <View>
          <TextField
            label="Jumlah stok"
            value={stockQty}
            onChangeText={setStockQty}
            placeholder="0"
            keyboardType="numeric"
            error={errors.stockQty}
          />
          {!errors.stockQty ? (
            <Text variant="caption" color={colors.neutral600} style={styles.hint}>
              Diberi peringatan kalau stok di bawah 8
            </Text>
          ) : null}
        </View>

        <View>
          <TextField
            label="Barcode"
            value={barcode}
            onChangeText={(v) => {
              setBarcode(v);
              setBarcodeNote(null);
            }}
            placeholder="Pindai atau ketik"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text variant="caption" color={barcodeNote ? colors.accent700 : colors.neutral600} style={styles.hint}>
            {barcodeNote ?? "Opsional"}
          </Text>
        </View>
      </View>

      {submitError ? (
        <Text variant="caption" color={colors.accent700} style={styles.submitError}>
          {submitError}
        </Text>
      ) : null}

      <Button
        title={isSaving ? "Menyimpan…" : "Simpan produk"}
        onPress={handleSave}
        disabled={isSaving}
        loading={isSaving}
        fullWidth
        style={styles.saveButton}
      />

      <BarcodeScanner visible={scannerOpen} onScanned={handleScanned} onClose={() => setScannerOpen(false)} />
    </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/**
 * The tappable photo box: shows the uploaded photo once there is one,
 * otherwise the "Add photo" dashed placeholder. A plain `Pressable` rather
 * than the shared `Button` component, since `Button` always renders its
 * `title` as text and doesn't accept custom children.
 */
function PhotoBox({
  onPress,
  loading,
  photoUri,
}: {
  onPress: () => void;
  loading: boolean;
  photoUri: string | null;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={styles.photoBox}
      accessibilityRole="button"
      accessibilityLabel="Tambah foto produk"
    >
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.photoImage} resizeMode="cover" />
      ) : (
        <View style={styles.photoEmpty}>
          <Camera size={28} color={colors.neutral600} />
          <Text variant="caption" color={colors.neutral700}>Tambah foto</Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * A selectable category chip for the product form. Mirrors the Sell screen's
 * category pills so a product created here can carry the same category the
 * cashier later filters by — the fix for app-created products vanishing the
 * moment any category pill is tapped.
 */
function CategoryChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.categoryChip, active ? styles.categoryChipActive : styles.categoryChipInactive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text variant="caption" color={active ? colors.surface : colors.neutral700} style={styles.categoryChipLabel}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  loadingContainer: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  // Generous bottom room so Android can scroll the lowest fields (Cost, Stock,
  // Barcode) and the Save button clear of the soft keyboard once it opens.
  content: { padding: space[4], paddingBottom: 320 },
  photoRow: { flexDirection: "row", gap: space[3], marginTop: space[4] },
  photoBox: {
    width: 120,
    height: 120,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.neutral400,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  photoEmpty: { alignItems: "center", gap: 4 },
  photoImage: { width: "100%", height: "100%" },
  photoSideCol: { flex: 1, gap: space[3], justifyContent: "center" },
  fields: { marginTop: space[4], gap: space[3] },
  categoryLabel: { marginBottom: 6 },
  categoryRow: { gap: space[2], paddingBottom: 2 },
  categoryChip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 18, borderWidth: 1 },
  categoryChipActive: { backgroundColor: colors.accent2, borderColor: colors.accent2 },
  categoryChipInactive: { backgroundColor: colors.surface, borderColor: colors.divider },
  categoryChipLabel: { fontWeight: "600" },
  hint: { marginTop: 4 },
  submitError: { marginTop: space[3] },
  saveButton: { marginTop: space[6] },
});
