import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import {
  Building2,
  ChevronLeft,
  Clock,
  CreditCard,
  ReceiptText,
  Sparkles,
  UsersRound,
  type LucideIcon,
} from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { FeatureKey } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { colors, radius, shadow, space } from "../../theme/tokens";
import { useMerchant, useSetFeatures } from "../../state/api/merchant";
import { apiErrorMessage } from "../../state/api/apiClient";
import type { HomeStackParamList } from "../../app/stacks/HomeStack";

type Props = NativeStackScreenProps<HomeStackParamList, "Features">;

const FEATURES: { key: FeatureKey; icon: LucideIcon; title: string; body: string }[] = [
  { key: "ppob", icon: ReceiptText, title: "Pulsa & tagihan", body: "Jual pulsa, token listrik, dan bayar tagihan pelanggan. Menambah menu Tagihan." },
  { key: "shift", icon: Clock, title: "Shift & modal kas", body: "Buka dan tutup shift, catat modal awal, dan cocokkan uang di laci." },
  { key: "advancedTender", icon: CreditCard, title: "Kartu debit & bayar campuran", body: "Selain tunai dan QRIS, terima kartu debit atau gabungan tunai + QRIS." },
  { key: "staff", icon: UsersRound, title: "Karyawan", body: "Tambah kasir dengan PIN sendiri dan atur siapa boleh melihat apa." },
  { key: "outlets", icon: Building2, title: "Banyak cabang", body: "Kelola lebih dari satu toko atau cabang franchise dari satu akun." },
  { key: "ai", icon: Sparkles, title: "Asisten AI", body: "Ringkasan harian otomatis dan tanya jawab tentang penjualan toko." },
];

export function FeaturesScreen({ navigation }: Props) {
  const merchant = useMerchant().data;
  const setFeatures = useSetFeatures();
  const enabled = merchant?.features ?? [];

  const toggle = (key: FeatureKey, on: boolean) => {
    const next = on ? [...enabled, key] : enabled.filter((k) => k !== key);
    setFeatures.mutate(next, {
      onError: (err) => Alert.alert("Gagal menyimpan", apiErrorMessage(err, "Periksa internet lalu coba lagi.")),
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <View style={styles.header}>
        <Pressable onPress={navigation.goBack} style={styles.iconButton} accessibilityLabel="Kembali">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text variant="h2">Fitur tambahan</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text variant="body" color={colors.neutral700} style={styles.intro}>
          Aplikasi dibuat sederhana: jualan, stok, dan laporan. Nyalakan fitur di bawah hanya kalau toko Anda membutuhkannya.
        </Text>

        {merchant && !merchant.features ? (
          <Text variant="body" color={colors.attention} style={styles.intro}>
            Server belum mendukung pengaturan ini. Semua fitur sedang aktif.
          </Text>
        ) : null}

        {FEATURES.map(({ key, icon: Icon, title, body }) => {
          const on = enabled.includes(key);
          return (
            <Pressable key={key} onPress={() => toggle(key, !on)} style={styles.row} accessibilityRole="switch" accessibilityState={{ checked: on }}>
              <View style={[styles.icon, on && styles.iconOn]}>
                <Icon size={24} color={on ? colors.actionFill : colors.neutral600} />
              </View>
              <View style={styles.copy}>
                <Text variant="h3">{title}</Text>
                <Text variant="caption" style={styles.body}>{body}</Text>
              </View>
              <Switch
                value={on}
                onValueChange={(value) => toggle(key, value)}
                disabled={!merchant?.features || setFeatures.isPending}
                trackColor={{ true: colors.accent300, false: colors.neutral300 }}
                thumbColor={on ? colors.actionFill : colors.surface}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 64, paddingHorizontal: space[4], flexDirection: "row", alignItems: "center", gap: space[3] },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  content: { padding: space[4], paddingBottom: space[8], gap: space[3] },
  intro: { marginBottom: space[2] },
  row: { flexDirection: "row", alignItems: "center", gap: space[3], padding: space[4], backgroundColor: colors.surface, borderRadius: radius.lg, ...shadow.sm },
  icon: { width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.neutral200 },
  iconOn: { backgroundColor: colors.accent100 },
  copy: { flex: 1 },
  body: { marginTop: 2 },
});
