import React, { useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ChevronLeft, Store, UtensilsCrossed } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import axios from "axios";
import { BusinessType, RegisterRequest, RegisterResponse } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { colors, radius, space } from "../../theme/tokens";
import { apiClient } from "../../state/api/apiClient";
import { useAuthStore } from "../../state/auth/authStore";
import type { RootStackParamList } from "../../app/RootNavigator";

type Props = NativeStackScreenProps<RootStackParamList, "Register">;

export function RegisterScreen({ navigation }: Props) {
  const login = useAuthStore((state) => state.login);
  const [step, setStep] = useState<1 | 2>(1);
  const [ownerName, setOwnerName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [businessType, setBusinessType] = useState<BusinessType>("retail");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accountValid = ownerName.trim().length >= 2 && email.includes("@") && password.length >= 8;
  const businessValid = businessName.trim().length >= 2 && phone.replace(/\D/g, "").length >= 8;

  const submit = async () => {
    if (!businessValid || submitting) return;
    setSubmitting(true); setError(null);
    try {
      const body: RegisterRequest = { ownerName: ownerName.trim(), email: email.trim().toLowerCase(), password, businessName: businessName.trim(), businessType, phone: phone.trim(), address: address.trim() || undefined };
      const { data } = await apiClient.post<RegisterResponse>("/api/auth/register", body);
      login(data);
    } catch (err) {
      if (axios.isAxiosError(err)) setError((err.response?.data as { message?: string } | undefined)?.message ?? "Pendaftaran gagal. Periksa data dan koneksi Anda.");
      else setError("Pendaftaran gagal. Coba lagi.");
    } finally { setSubmitting(false); }
  };

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <KeyboardAvoidingView style={styles.safe} behavior="padding">
        <View style={styles.header}>
          <Pressable onPress={() => step === 2 ? setStep(1) : navigation.goBack()} style={styles.backButton}><ChevronLeft size={23} color={colors.text} /></Pressable>
          <View style={styles.headerCopy}><Text variant="h3">Daftarkan usaha</Text><Text variant="caption">Langkah {step} dari 2</Text></View>
        </View>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 1 ? (
            <>
              <Text variant="h2">Buat akun pemilik</Text>
              <Text variant="body" color={colors.neutral600} style={styles.intro}>Akun ini dapat melihat laporan, mengatur staf, outlet, dan langganan.</Text>
              <View style={styles.fields}>
                <TextField label="Nama pemilik" value={ownerName} onChangeText={setOwnerName} placeholder="Nama lengkap" />
                <TextField label="Email" value={email} onChangeText={setEmail} placeholder="nama@email.com" autoCapitalize="none" keyboardType="email-address" />
                <TextField label="Password" value={password} onChangeText={setPassword} placeholder="Minimal 8 karakter" secureTextEntry />
              </View>
              <Button title="Lanjutkan" onPress={() => setStep(2)} disabled={!accountValid} fullWidth style={styles.action} />
            </>
          ) : (
            <>
              <Text variant="h2">Informasi usaha</Text>
              <Text variant="body" color={colors.neutral600} style={styles.intro}>Kami akan membuat outlet utama dan trial Starter selama 14 hari.</Text>
              <Text variant="kicker" style={styles.typeLabel}>JENIS USAHA</Text>
              <View style={styles.typeRow}>
                <BusinessTypeButton title="Retail / toko" subtitle="Barcode dan stok" icon={Store} active={businessType === "retail"} onPress={() => setBusinessType("retail")} />
                <BusinessTypeButton title="Restoran" subtitle="Meja dan pesanan" icon={UtensilsCrossed} active={businessType === "restaurant"} onPress={() => setBusinessType("restaurant")} />
              </View>
              <View style={styles.fields}>
                <TextField label="Nama usaha" value={businessName} onChangeText={setBusinessName} placeholder="Contoh: Warung Sari Rasa" />
                <TextField label="Nomor WhatsApp" value={phone} onChangeText={setPhone} placeholder="08xxxxxxxxxx" keyboardType="phone-pad" />
                <TextField label="Alamat outlet utama" value={address} onChangeText={setAddress} placeholder="Opsional" />
              </View>
              {error ? <Text variant="caption" color={colors.accent700} style={styles.error}>{error}</Text> : null}
              <Button title={submitting ? "Membuat usaha…" : "Mulai trial 14 hari"} onPress={submit} disabled={!businessValid || submitting} loading={submitting} fullWidth style={styles.action} />
              <Text variant="caption" color={colors.neutral500} style={styles.terms}>Dengan mendaftar, Anda menyetujui syarat layanan dan kebijakan privasi Kotdee POS.</Text>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function BusinessTypeButton({ title, subtitle, icon: Icon, active, onPress }: { title: string; subtitle: string; icon: typeof Store; active: boolean; onPress: () => void }) {
  return <Pressable onPress={onPress} style={[styles.typeButton, active && styles.typeButtonActive]}><Icon size={22} color={active ? colors.accent2 : colors.neutral600} /><Text variant="body" style={styles.typeTitle}>{title}</Text><Text variant="caption" color={colors.neutral600}>{subtitle}</Text></Pressable>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 58, paddingHorizontal: space[3], flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: colors.divider },
  backButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerCopy: { marginLeft: space[2] },
  content: { flexGrow: 1, padding: space[4], paddingBottom: space[8] },
  intro: { marginTop: space[2], lineHeight: 20 },
  fields: { marginTop: space[6], gap: space[3] },
  action: { marginTop: space[6] },
  typeLabel: { marginTop: space[6], marginBottom: space[2] },
  typeRow: { flexDirection: "row", gap: space[2] },
  typeButton: { flex: 1, minHeight: 108, padding: space[3], borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider, backgroundColor: colors.surface },
  typeButtonActive: { borderColor: colors.accent2, backgroundColor: colors.accent2100 },
  typeTitle: { fontWeight: "600", marginTop: space[2] },
  error: { marginTop: space[3] },
  terms: { textAlign: "center", marginTop: space[3], lineHeight: 17 },
});
