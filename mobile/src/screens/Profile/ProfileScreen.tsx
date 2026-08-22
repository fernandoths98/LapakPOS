import React from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { ChevronLeft, ChevronRight, ShieldCheck, Store, UserRound, UsersRound } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { colors, radius, space } from "../../theme/tokens";
import { useMerchant } from "../../state/api/merchant";
import { useAuthStore } from "../../state/auth/authStore";
import { usePendingSalesStore } from "../../state/offline/pendingSalesQueue";
import { queryClient } from "../../state/api/queryClient";
import type { HomeStackParamList } from "../../app/stacks/HomeStack";

type Props = NativeStackScreenProps<HomeStackParamList, "Profile">;

export function ProfileScreen({ navigation }: Props) {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const pendingSales = usePendingSalesStore((state) => state.items.length);
  const merchantQuery = useMerchant();
  const merchant = merchantQuery.data;

  const confirmLogout = () => {
    const warning = pendingSales > 0
      ? `Masih ada ${pendingSales} transaksi yang belum tersinkron. Sebaiknya hubungkan internet sebelum keluar.`
      : "Anda perlu masuk kembali untuk menggunakan kasir.";
    Alert.alert("Keluar dari akun?", warning, [
      { text: "Batal", style: "cancel" },
      {
        text: "Keluar",
        style: "destructive",
        onPress: () => {
          queryClient.clear();
          logout();
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <View style={styles.header}>
        <Pressable onPress={navigation.goBack} style={styles.iconButton} accessibilityLabel="Kembali">
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text variant="h2">Profil & pengaturan</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.identityCard}>
          <View style={styles.avatar}><UserRound size={28} color={colors.accent2} /></View>
          <View style={styles.identityText}>
            <Text variant="h3">{user?.name ?? "Pengguna"}</Text>
            <Text variant="caption" color={colors.neutral600}>{user?.email ?? "-"}</Text>
            <View style={styles.roleBadge}>
              <ShieldCheck size={13} color={colors.success} />
              <Text variant="caption" color={colors.success}>{user?.role === "owner" ? "Pemilik" : "Kasir"}</Text>
            </View>
          </View>
        </View>

        <Text variant="kicker" style={styles.sectionTitle}>TOKO AKTIF</Text>
        <View style={styles.infoCard}>
          <View style={styles.storeIcon}><Store size={22} color={colors.accent} /></View>
          <View style={styles.infoText}>
            <Text variant="h3">{merchant?.name ?? "Memuat toko…"}</Text>
            <Text variant="caption" color={colors.neutral600}>{merchant?.address || "Alamat toko belum diisi"}</Text>
            <Text variant="caption" color={colors.neutral600}>{merchant?.phone || "Nomor telepon belum diisi"}</Text>
          </View>
        </View>

        <Text variant="kicker" style={styles.sectionTitle}>STATUS DATA</Text>
        <View style={styles.statusRow}>
          <View style={[styles.statusDot, pendingSales > 0 && styles.statusDotWarning]} />
          <View style={styles.infoText}>
            <Text variant="body">{pendingSales > 0 ? `${pendingSales} transaksi menunggu sinkron` : "Semua transaksi tersinkron"}</Text>
            <Text variant="caption" color={colors.neutral600}>Data transaksi offline tetap tersimpan di perangkat.</Text>
          </View>
        </View>

        {user?.role === "owner" || user?.role === "manager" ? (
          <>
            <Text variant="kicker" style={styles.sectionTitle}>PENGELOLAAN USAHA</Text>
            <Pressable onPress={() => navigation.navigate("AccountManagement")} style={styles.managementRow}>
              <View style={styles.managementIcon}><UsersRound size={21} color={colors.accent2} /></View>
              <View style={styles.infoText}><Text variant="body" style={styles.managementTitle}>Outlet, staf, dan paket</Text><Text variant="caption" color={colors.neutral600}>Atur akses kasir dan lihat status langganan</Text></View>
              <ChevronRight size={19} color={colors.neutral500} />
            </Pressable>
          </>
        ) : null}

        <View style={styles.helpCard}>
          <Text variant="h3">Tentang menu ini</Text>
          <Text variant="caption" color={colors.neutral700} style={styles.helpText}>
            Pengaturan printer tetap tersedia saat mencetak struk. Pengaturan toko dan pengguna akan ditambahkan di sini setelah hak akses pemilik tersedia.
          </Text>
        </View>

        <Button title="Keluar dari akun" variant="secondary" onPress={confirmLogout} fullWidth style={styles.logoutButton} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 60, paddingHorizontal: space[4], flexDirection: "row", alignItems: "center", gap: space[3], borderBottomWidth: 1, borderBottomColor: colors.divider },
  iconButton: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  headerSpacer: { width: 40 },
  content: { padding: space[4], paddingBottom: space[8] },
  identityCard: { flexDirection: "row", alignItems: "center", padding: space[4], backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.divider },
  avatar: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent2100 },
  identityText: { flex: 1, marginLeft: space[3], gap: 3 },
  roleBadge: { alignSelf: "flex-start", flexDirection: "row", gap: 4, alignItems: "center", marginTop: 4 },
  sectionTitle: { marginTop: space[6], marginBottom: space[2] },
  infoCard: { flexDirection: "row", padding: space[4], backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider },
  storeIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent100 },
  infoText: { flex: 1, marginLeft: space[3], gap: 4 },
  statusRow: { flexDirection: "row", alignItems: "flex-start", padding: space[4], backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.divider },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginTop: 6, backgroundColor: colors.success },
  statusDotWarning: { backgroundColor: colors.warning },
  managementRow: { flexDirection: "row", alignItems: "center", padding: space[3], borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider },
  managementIcon: { width: 42, height: 42, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.accent2100 },
  managementTitle: { fontWeight: "600" },
  helpCard: { marginTop: space[6], padding: space[4], borderRadius: radius.md, backgroundColor: colors.neutral200 },
  helpText: { marginTop: space[2], lineHeight: 19 },
  logoutButton: { marginTop: space[6] },
});
