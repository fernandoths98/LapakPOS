import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { launchCamera, launchImageLibrary } from "react-native-image-picker";
import { parseRupiah, PhotoFillResponse } from "@lapak/shared";
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
  usePhotoFillProduct,
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
  const photoFill = usePhotoFillProduct();

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
  const [snapToFillError, setSnapToFillError] = useState<string | null>(null);

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
      ? `Margin ${Math.round(((sellPriceNum - costPriceNum) / sellPriceNum) * 100)}% at this cost`
      : "Enter both prices to see the margin";

  /**
   * Shared image-picker step for both "Add photo" and "Snap to fill" — the
   * only two flows in this screen that ever open the camera/gallery. Returns
   * `null` when the cashier cancels (a normal, silent outcome); throws with a
   * plain message on any other failure so each caller can show it however
   * fits its own UI (an `Alert` for the photo box, an inline message for
   * Snap to fill).
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
      throw new Error("No image data was returned.");
    }
    return { imageBase64: asset.base64, mimeType: asset.type ?? "image/jpeg" };
  };

  const handlePickPhoto = () => {
    Alert.alert("Add photo", "Take a new photo or choose one from the gallery.", [
      { text: "Camera", onPress: () => pickPhoto("camera") },
      { text: "Gallery", onPress: () => pickPhoto("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const pickPhoto = async (source: "camera" | "library") => {
    let picked: { imageBase64: string; mimeType: string } | null;
    try {
      picked = await pickImage(source);
    } catch (err) {
      Alert.alert("Couldn't get photo", err instanceof Error ? err.message : "Unknown error");
      return;
    }
    if (!picked) return;

    try {
      const uploaded = await uploadPhoto.mutateAsync(picked);
      setImageUrl(uploaded.imageUrl);
    } catch {
      Alert.alert("Upload failed", "The photo couldn't be uploaded. Check your connection and try again.");
    }
  };

  const handleSnapToFill = () => {
    setSnapToFillError(null);
    Alert.alert("Snap to fill", "Photograph the packet — name, size and barcode fill themselves.", [
      { text: "Camera", onPress: () => pickPhotoForFill("camera") },
      { text: "Gallery", onPress: () => pickPhotoForFill("library") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const pickPhotoForFill = async (source: "camera" | "library") => {
    let picked: { imageBase64: string; mimeType: string } | null;
    try {
      picked = await pickImage(source);
    } catch (err) {
      setSnapToFillError(err instanceof Error ? err.message : "Couldn't get photo.");
      return;
    }
    if (!picked) return;

    try {
      const filled = await photoFill.mutateAsync(picked);
      applyPhotoFillResult(filled);
    } catch (err) {
      setSnapToFillError(extractErrorMessage(err, "AI photo-fill isn't available yet."));
    }
  };

  /**
   * Pre-fills Name and Barcode from a successful photo-fill — a fill assist,
   * never a lock: every field stays plain-editable right after. There's no
   * separate "size" input in this form's data model (`Product` has no
   * `size` column — see shared/src/types/domain.ts), so a returned `size`
   * (e.g. "250 ml") is folded into the Name field alongside the product
   * name, matching how a warung actually writes it on the shelf ("Indomie
   * Goreng 85g"). Sell price and Cost are deliberately left untouched — the
   * endpoint never returns pricing, matching the prototype's own promise
   * ("name, size and barcode fill themselves," not price).
   */
  const applyPhotoFillResult = (filled: PhotoFillResponse) => {
    const nameParts = [filled.name, filled.size].filter((part): part is string => !!part && part.trim() !== "");
    if (nameParts.length > 0) {
      setName(nameParts.join(" "));
    }
    if (filled.barcode) {
      setBarcode(filled.barcode);
      setBarcodeNote(null);
    }
    if (nameParts.length === 0 && !filled.barcode) {
      setSnapToFillError("Couldn't confidently read anything from that photo — fill the fields in by hand.");
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
        setBarcodeNote(`Already used by "${existing.name}" — saving will be rejected unless you change it.`);
      }
    } catch {
      // Best-effort duplicate check; a failed lookup shouldn't block filling the field.
    }
  };

  const validate = (): FormErrors => {
    const next: FormErrors = {};
    if (!name.trim()) next.name = "Product name is required";
    if (sellPrice === "" || sellPriceNum < 0) next.sellPrice = "Enter a sell price of 0 or more";
    if (costPrice === "" || costPriceNum < 0) next.costPrice = "Enter a cost of 0 or more";
    if (stockQty === "" || parseRupiah(stockQty) < 0) next.stockQty = "Enter a stock count of 0 or more";
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
      setSubmitError(extractErrorMessage(err, "Couldn't save the product. Check your connection and try again."));
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
      <Text variant="h2">{isEditing ? "Edit product" : "New product"}</Text>

      <View style={styles.photoRow}>
        <PhotoBox onPress={handlePickPhoto} loading={uploadPhoto.isPending} photoUri={photoUri} />

        <View style={styles.photoSideCol}>
          <View style={styles.snapCard}>
            <Text variant="kicker">Snap to fill</Text>
            <Text variant="caption" color={colors.neutral700} style={styles.snapBody}>
              Photograph the packet — name, size and barcode fill themselves.
            </Text>
            <Button
              title={photoFill.isPending ? "Reading photo…" : "Try it"}
              variant="ghost"
              loading={photoFill.isPending}
              disabled={photoFill.isPending}
              onPress={handleSnapToFill}
              style={styles.snapButton}
            />
            {snapToFillError ? (
              <Text variant="caption" color={colors.accent700} style={styles.snapError}>
                {snapToFillError}
              </Text>
            ) : null}
          </View>
          <Button title="Scan barcode" variant="secondary" onPress={handleScanBarcode} />
        </View>
      </View>

      <View style={styles.fields}>
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Product name"
          error={errors.name}
        />

        <View>
          <Text variant="kicker" style={styles.categoryLabel}>Category</Text>
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
            label="Sell price"
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
            label="Cost"
            value={costPrice}
            onChangeText={setCostPrice}
            placeholder="0"
            keyboardType="numeric"
            error={errors.costPrice}
          />
          {!errors.costPrice ? (
            <Text variant="caption" color={colors.neutral600} style={styles.hint}>
              {isEditing ? "Changing this writes to the product's cost history" : "From your last supplier note"}
            </Text>
          ) : null}
        </View>

        <View>
          <TextField
            label="Stock"
            value={stockQty}
            onChangeText={setStockQty}
            placeholder="0"
            keyboardType="numeric"
            error={errors.stockQty}
          />
          {!errors.stockQty ? (
            <Text variant="caption" color={colors.neutral600} style={styles.hint}>
              Alert me under 8
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
            placeholder="Scan or type"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text variant="caption" color={barcodeNote ? colors.accent700 : colors.neutral600} style={styles.hint}>
            {barcodeNote ?? "Scan or type"}
          </Text>
        </View>
      </View>

      {submitError ? (
        <Text variant="caption" color={colors.accent700} style={styles.submitError}>
          {submitError}
        </Text>
      ) : null}

      <Button
        title={isSaving ? "Saving…" : "Save product"}
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
      accessibilityLabel="Add photo"
    >
      {loading ? (
        <ActivityIndicator color={colors.accent} />
      ) : photoUri ? (
        <Image source={{ uri: photoUri }} style={styles.photoImage} resizeMode="cover" />
      ) : (
        <Text variant="caption" color={colors.neutral600}>
          Add photo
        </Text>
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
    width: 104,
    height: 104,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.neutral400,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  photoImage: { width: "100%", height: "100%" },
  photoSideCol: { flex: 1, gap: space[2] },
  snapCard: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: space[2],
  },
  snapBody: { marginTop: 4 },
  snapButton: { alignSelf: "flex-start", paddingHorizontal: 0, minHeight: 0, marginTop: 2 },
  snapError: { marginTop: 4 },
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
