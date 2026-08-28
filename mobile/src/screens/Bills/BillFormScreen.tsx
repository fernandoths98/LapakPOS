import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View, type TextInputProps } from "react-native";
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check } from "lucide-react-native";
import { CheckBillResponse, formatRupiah, PpobCategory } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { colors, radius, shadow, space } from "../../theme/tokens";
import { PrepaidCategory, useCheckBill, usePayBill, usePrepaidProducts } from "../../state/api/ppob";
import { BillsStackParamList } from "../../app/stacks/BillsStack";

/**
 * Bluetooth printing is Phase 7 — there's no printer-pairing flow yet, and
 * no merchant-settings endpoint either. This renders the seeded merchant's
 * known default printer name as static text, the same known-simplification
 * precedent Phase 2's receipt screen used for the merchant header.
 */
const PRINTER_NAME = "RPP02N";

const DEVELOPMENT_TEST_NUMBER: Partial<Record<PpobCategory, string>> = {
  electricity: "530000000001",
  water: "1013226",
  health_insurance: "8801234560001",
  internet_tv: "6391601001",
};

interface FormCopy {
  title: string;
  intro: string;
  fieldLabel: string;
  placeholder: string;
  keyboardType: TextInputProps["keyboardType"];
  productTitle: string;
  confirmLabel: string;
  emptyProducts: string;
}

const FORM_COPY: Record<PpobCategory, FormCopy> = {
  electricity: { title: "Listrik PLN", intro: "Masukkan ID pelanggan untuk mengecek tagihan atau pilih token listrik.", fieldLabel: "ID pelanggan", placeholder: "Masukkan ID pelanggan PLN", keyboardType: "numeric", productTitle: "Pilih nominal token", confirmLabel: "Konfirmasi token", emptyProducts: "Nominal token sedang tidak tersedia." },
  mobile: { title: "Pulsa & Paket Data", intro: "Masukkan nomor HP. Produk yang sesuai dengan operator akan ditampilkan otomatis.", fieldLabel: "Nomor HP tujuan", placeholder: "Contoh: 081234567890", keyboardType: "phone-pad", productTitle: "Pilih pulsa atau paket", confirmLabel: "Konfirmasi produk", emptyProducts: "Produk untuk operator nomor ini belum ditemukan." },
  water: { title: "Tagihan PDAM", intro: "Masukkan nomor pelanggan yang tertera pada tagihan air.", fieldLabel: "Nomor pelanggan PDAM", placeholder: "Masukkan nomor pelanggan PDAM", keyboardType: "numeric", productTitle: "Pilih produk", confirmLabel: "Cek tagihan", emptyProducts: "Layanan PDAM sedang tidak tersedia." },
  health_insurance: { title: "Iuran BPJS", intro: "Masukkan nomor peserta atau nomor virtual account BPJS.", fieldLabel: "Nomor peserta / VA", placeholder: "Masukkan nomor peserta BPJS", keyboardType: "numeric", productTitle: "Pilih produk", confirmLabel: "Cek iuran", emptyProducts: "Layanan BPJS sedang tidak tersedia." },
  ewallet: { title: "Top Up E-Wallet", intro: "Masukkan nomor HP yang terdaftar pada akun e-wallet, lalu pilih nominal.", fieldLabel: "Nomor HP akun e-wallet", placeholder: "Contoh: 081234567890", keyboardType: "phone-pad", productTitle: "Pilih e-wallet dan nominal", confirmLabel: "Konfirmasi top up", emptyProducts: "Produk e-wallet sedang tidak tersedia." },
  internet_tv: { title: "Tagihan Internet & TV", intro: "Masukkan nomor pelanggan layanan internet atau TV berlangganan.", fieldLabel: "Nomor pelanggan", placeholder: "Masukkan nomor pelanggan internet / TV", keyboardType: "numeric", productTitle: "Pilih produk", confirmLabel: "Cek tagihan", emptyProducts: "Layanan internet dan TV sedang tidak tersedia." },
  games: { title: "Voucher Game", intro: "Masukkan User ID game sesuai akun pelanggan. Sertakan Zone ID jika diminta oleh game.", fieldLabel: "User ID / Zone ID", placeholder: "Contoh: 12345678(1234)", keyboardType: "default", productTitle: "Pilih game dan nominal", confirmLabel: "Konfirmasi voucher", emptyProducts: "Voucher game sedang tidak tersedia." },
  tv_voucher: { title: "Voucher TV Prabayar", intro: "Masukkan nomor pelanggan atau nomor smart card dekoder, lalu pilih paket tayangan.", fieldLabel: "Nomor pelanggan / smart card", placeholder: "Masukkan nomor smart card", keyboardType: "numeric", productTitle: "Pilih paket TV", confirmLabel: "Konfirmasi paket TV", emptyProducts: "Paket TV prabayar sedang tidak tersedia." },
  gas: { title: "Produk Gas", intro: "Masukkan nomor pelanggan atau nomor tujuan yang terdaftar pada layanan gas.", fieldLabel: "Nomor pelanggan gas", placeholder: "Masukkan nomor pelanggan gas", keyboardType: "numeric", productTitle: "Pilih produk gas", confirmLabel: "Konfirmasi produk gas", emptyProducts: "Produk gas sedang tidak tersedia." },
};

function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message ?? fallback;
}

export function BillFormScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<BillsStackParamList>>();
  const route = useRoute<RouteProp<BillsStackParamList, "BillForm">>();
  const { billerId, category } = route.params;
  const formCopy = FORM_COPY[category];
  const testNumber = DEVELOPMENT_TEST_NUMBER[category];
  const [electricityMode, setElectricityMode] = useState<"postpaid" | "token">("postpaid");
  const prepaid = ["mobile", "ewallet", "games", "tv_voucher", "gas"].includes(category) || (category === "electricity" && electricityMode === "token");
  const prepaidCategory: PrepaidCategory = category === "electricity" ? "electricity" : category as PrepaidCategory;
  const productQuery = usePrepaidProducts(prepaidCategory, prepaid);

  const checkBill = useCheckBill();
  const payBill = usePayBill();

  const [customerNumber, setCustomerNumber] = useState("");
  const [quote, setQuote] = useState<CheckBillResponse | null>(null);
  const [selectedSku, setSelectedSku] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const visibleProducts = useMemo(() => {
    const brand = category === "mobile" ? detectPhoneBrand(customerNumber.replace(/\D/g, "")) : null;
    const rows = productQuery.data ?? [];
    return (brand ? rows.filter(item => item.brand.toUpperCase().includes(brand)) : rows).slice(0, 40);
  }, [category, customerNumber, productQuery.data]);

  // Changing the number after a quote was fetched invalidates it — the quote
  // (and its checkRef) belongs to the number it was checked for.
  const handleChangeNumber = (value: string) => {
    setCustomerNumber(value);
    if (quote) setQuote(null);
    setSelectedSku(null);
    setErrorMessage(null);
  };

  const handleCheck = async () => {
    setErrorMessage(null);
    const trimmed = customerNumber.trim();
    if (!trimmed) {
      setErrorMessage(`Masukkan ${formCopy.fieldLabel.toLowerCase()} terlebih dahulu.`);
      return;
    }
    if (prepaid && !selectedSku) {
      setErrorMessage(`${formCopy.productTitle} terlebih dahulu.`);
      return;
    }
    try {
      const result = await checkBill.mutateAsync({ billerId, customerNumber: trimmed, skuCode: selectedSku ?? undefined });
      setQuote(result);
    } catch (err) {
      setErrorMessage(extractErrorMessage(err, "Tagihan tidak ditemukan. Periksa nomor lalu coba lagi."));
    }
  };

  const handleCharge = async () => {
    if (!quote) return;
    setErrorMessage(null);
    try {
      const result = await payBill.mutateAsync({ billerId, customerNumber: customerNumber.trim(), checkRef: quote.checkRef });
      navigation.replace("BillSuccess", { transaction: result.transaction });
    } catch (err) {
      // A real failure — provider decline, expired quote, etc — surfaces inline;
      // it never gets swallowed into a silent success.
      setErrorMessage(extractErrorMessage(err, "Pembayaran gagal diproses. Cek ulang tagihan lalu coba lagi."));
      setQuote(null);
    }
  };

  const isBusy = checkBill.isPending || payBill.isPending;
  const actionLabel = payBill.isPending
    ? "Memproses pembayaran…"
    : checkBill.isPending
      ? "Mengecek tagihan…"
      : quote
        ? `Bayar · ${formatRupiah(quote.customerPays)}`
        : prepaid ? formCopy.confirmLabel : "Cek tagihan";

  return (
    <SafeAreaView style={styles.container} edges={[]}>
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.stepBadge}><Text variant="caption" color={colors.accent2}>LANGKAH 1 DARI 2</Text></View>
      <Text variant="h2" style={styles.title}>{formCopy.title}</Text>
      <Text variant="body" color={colors.neutral700} style={styles.intro}>{formCopy.intro}</Text>
      {category === "electricity" ? <View style={styles.modeSwitch}>
        <Pressable onPress={() => { setElectricityMode("postpaid"); setCustomerNumber(""); setSelectedSku(null); setQuote(null); setErrorMessage(null); }} style={[styles.modeButton, electricityMode === "postpaid" && styles.modeButtonActive]}><Text variant="body" color={electricityMode === "postpaid" ? colors.surface : colors.neutral700}>Tagihan bulanan</Text></Pressable>
        <Pressable onPress={() => { setElectricityMode("token"); setCustomerNumber(""); setSelectedSku(null); setQuote(null); setErrorMessage(null); }} style={[styles.modeButton, electricityMode === "token" && styles.modeButtonActive]}><Text variant="body" color={electricityMode === "token" ? colors.surface : colors.neutral700}>Token listrik</Text></Pressable>
      </View> : null}
      {testNumber && !prepaid ? <Pressable style={styles.testCard} onPress={() => handleChangeNumber(testNumber)}>
        <View><Text variant="kicker" color={colors.accent2}>MODE UJI DIGIFLAZZ</Text><Text variant="caption" color={colors.neutral600} style={styles.testCaption}>Gunakan nomor sukses: {testNumber}</Text></View>
        <Text variant="caption" color={colors.accent2}>PAKAI</Text>
      </Pressable> : null}

      <TextField
        label={category === "electricity" && prepaid ? "Nomor meter / ID pelanggan" : formCopy.fieldLabel}
        value={customerNumber}
        onChangeText={handleChangeNumber}
        placeholder={category === "electricity" && prepaid ? "Masukkan nomor meter atau ID pelanggan" : formCopy.placeholder}
        keyboardType={formCopy.keyboardType}
        style={styles.field}
      />

      {prepaid ? <View style={styles.productSection}>
        <View style={styles.productHeading}><Text variant="h3">{formCopy.productTitle}</Text><Text variant="caption" color={colors.neutral600}>{visibleProducts.length} produk</Text></View>
        {productQuery.isLoading ? <Text variant="caption" color={colors.neutral600}>Memuat produk Digiflazz…</Text> : null}
        {productQuery.isError ? <Pressable onPress={() => productQuery.refetch()}><Text variant="caption" color={colors.accent}>Produk gagal dimuat · ketuk untuk mencoba lagi</Text></Pressable> : null}
        <View style={styles.productList}>{visibleProducts.map(product => {
          const selected = selectedSku === product.skuCode;
          return <Pressable key={product.skuCode} onPress={() => { setSelectedSku(product.skuCode); setQuote(null); setErrorMessage(null); }} style={[styles.productRow, selected && styles.productRowSelected]}>
            <View style={styles.productCopy}><Text variant="body" style={styles.productName} numberOfLines={2}>{product.name}</Text><Text variant="caption" color={colors.neutral600}>{product.brand} · {product.type}</Text></View>
            <View style={styles.productPrice}><Text variant="tabular" color={selected ? colors.accent2 : colors.text}>{formatRupiah(product.price)}</Text><Text variant="caption" color={colors.success}>+ komisi</Text></View>
          </Pressable>;
        })}</View>
        {!productQuery.isLoading && visibleProducts.length === 0 ? <Text variant="caption" color={colors.warning}>{formCopy.emptyProducts}</Text> : null}
      </View> : null}

      {quote ? (
        <View style={styles.card}>
          <View style={styles.foundRow}><View style={styles.checkBadge}><Check size={13} color={colors.success} strokeWidth={3} /></View><Text variant="kicker" color={colors.success}>{prepaid ? "RINCIAN PEMBELIAN" : "TAGIHAN DITEMUKAN"}</Text></View>
          <Text variant="h3" style={styles.customerName}>
            {quote.customerName}
          </Text>
          <Text variant="caption" color={colors.neutral700}>
            {quote.meta}
          </Text>

          <View style={styles.divider} />

          <SummaryLine label={prepaid ? "Harga produk" : "Jumlah tagihan"} value={formatRupiah(quote.billAmount)} />
          <SummaryLine label="Biaya admin" value={formatRupiah(quote.adminFee)} />
          <SummaryLine label="Komisi toko" value={`+${formatRupiah(quote.marginAmount)}`} color={colors.success} />

          <View style={styles.totalRow}>
            <Text variant="kicker">TOTAL BAYAR</Text>
            <Text variant="h2" style={styles.totalValue}>
              {formatRupiah(quote.customerPays)}
            </Text>
          </View>
        </View>
      ) : null}

      {errorMessage ? (
        <Text variant="caption" color={colors.accent700} style={styles.errorText}>
          {errorMessage}
        </Text>
      ) : null}
    </ScrollView>

    <View style={styles.actionBar}>
      <Button
        title={actionLabel}
        onPress={quote ? handleCharge : handleCheck}
        disabled={isBusy}
        loading={isBusy}
        fullWidth
      />
      <Text variant="caption" color={colors.neutral600} style={styles.printerCaption}>
        Struk otomatis dicetak ke {PRINTER_NAME}
      </Text>
    </View>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SummaryLine({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.summaryLine}>
      <Text variant="body" color={color}>
        {label}
      </Text>
      <Text variant="body" color={color}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space[3], paddingBottom: 116 },
  actionBar: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: space[3], paddingTop: space[3], paddingBottom: space[3], backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.divider, ...shadow.lg },
  stepBadge: { alignSelf: "flex-start", backgroundColor: colors.accent2100, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5 },
  title: { marginTop: space[3] },
  intro: { marginTop: space[2], lineHeight: 21 },
  testCard: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: colors.accent2100, borderRadius: radius.md, padding: space[3], marginTop: space[3] },
  testCaption: { marginTop: 3 },
  field: { marginTop: space[4] },
  card: {
    marginTop: space[4],
    borderWidth: 1,
    backgroundColor: colors.surface,
    borderColor: colors.divider,
    borderRadius: radius.lg,
    padding: space[4],
  },
  foundRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  checkBadge: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#EAF8F0", alignItems: "center", justifyContent: "center" },
  customerName: { marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: space[2] + 3 },
  summaryLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: colors.text,
    marginTop: space[2],
    paddingTop: space[2],
  },
  totalValue: { fontSize: 20 },
  errorText: { marginTop: space[3] },
  printerCaption: { textAlign: "center", marginTop: space[2] },
  modeSwitch: { flexDirection: "row", gap: space[2], marginTop: space[4], padding: 4, borderRadius: radius.md, backgroundColor: colors.neutral200 }, modeButton: { flex: 1, alignItems: "center", paddingVertical: 11, borderRadius: radius.sm }, modeButtonActive: { backgroundColor: colors.accent2 },
  productSection: { marginTop: space[4] }, productHeading: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space[2] }, productList: { gap: 6 },
  productRow: { flexDirection: "row", alignItems: "center", minHeight: 58, gap: space[2], paddingVertical: space[2], paddingHorizontal: space[3], backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.sm }, productRowSelected: { borderColor: colors.accent2, backgroundColor: colors.accent2100 }, productCopy: { flex: 1 }, productName: { fontWeight: "600", fontSize: 14 }, productPrice: { alignItems: "flex-end" },
});

function detectPhoneBrand(number: string): string | null {
  const value = number.startsWith("62") ? `0${number.slice(2)}` : number;
  if (/^08(11|12|13|21|22|23|51|52|53)/.test(value)) return "TELKOMSEL";
  if (/^08(14|15|16|55|56|57|58)/.test(value)) return "INDOSAT";
  if (/^08(17|18|19|59|77|78)/.test(value)) return "XL";
  if (/^083[1-8]/.test(value)) return "AXIS";
  if (/^089[5-9]/.test(value)) return "TRI";
  if (/^088[1-9]/.test(value)) return "SMART";
  return null;
}
