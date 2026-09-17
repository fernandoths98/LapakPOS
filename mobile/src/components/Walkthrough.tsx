import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import {
  ChartNoAxesColumnIncreasing,
  House,
  PackageOpen,
  ReceiptText,
  ShoppingCart,
  Sparkles,
  type LucideIcon,
} from "lucide-react-native";
import type { UserRole } from "@lapak/shared";
import { Text } from "../theme/Text";
import { Button } from "./Button";
import { colors, radius, space } from "../theme/tokens";
import { useAuthStore } from "../state/auth/authStore";
import { useWalkthroughStore } from "../state/walkthrough/walkthroughStore";

interface Step {
  icon: LucideIcon;
  title: string;
  body: string[];
  /** Roles that see this step; omitted means everyone. */
  roles?: UserRole[];
}

/**
 * Plain-language steps, one idea per screen, each pointing at the tab label
 * the user will actually see at the bottom. Written for someone who has never
 * used a cashier app: numbered actions, no jargon.
 */
const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: "Selamat datang!",
    body: [
      "Panduan singkat ini menunjukkan cara memakai aplikasi kasir, langkah demi langkah.",
      "Hanya perlu sekitar 1 menit. Bisa dibuka lagi kapan saja dari menu Profil.",
    ],
  },
  {
    icon: House,
    title: "Beranda",
    body: [
      "Tombol paling kiri di bawah layar.",
      "Di sini terlihat uang masuk hari ini dan barang yang stoknya hampir habis.",
      "Tekan tombol profil di pojok atas untuk pengaturan dan keluar akun.",
    ],
  },
  {
    icon: PackageOpen,
    title: "1. Isi barang dulu",
    roles: ["owner", "manager", "stocker"],
    body: [
      "Buka menu Stok di bawah layar.",
      "Tekan tombol \"Produk baru\", isi nama barang, harga jual, harga modal, dan jumlah stok.",
      "Harga dan stok bisa diubah kapan saja dengan menekan nama barangnya.",
    ],
  },
  {
    icon: ShoppingCart,
    title: "2. Melayani pembeli",
    roles: ["owner", "manager", "cashier"],
    body: [
      "Buka menu Jualan.",
      "Tekan barang yang dibeli. Tekan lagi untuk menambah jumlahnya.",
      "Tekan tombol merah BAYAR di bawah, masukkan uang yang diterima, lalu selesai. Kembalian dihitung otomatis.",
    ],
  },
  {
    icon: ReceiptText,
    title: "Tagihan & pulsa",
    roles: ["owner", "manager", "cashier"],
    body: [
      "Menu Tagihan untuk menjual pulsa, token listrik, dan bayar tagihan pelanggan.",
      "Pilih jenisnya, ketik nomor pelanggan, lalu ikuti petunjuk di layar.",
    ],
  },
  {
    icon: ChartNoAxesColumnIncreasing,
    title: "3. Lihat hasil jualan",
    roles: ["owner", "manager"],
    body: [
      "Buka menu Laporan.",
      "Terlihat total penjualan, keuntungan, dan barang paling laku per hari atau per bulan.",
    ],
  },
  {
    icon: Sparkles,
    title: "Siap dipakai!",
    body: [
      "Tidak ada internet? Tetap bisa jualan. Data dikirim otomatis saat internet kembali.",
      "Lupa caranya? Buka Profil, lalu tekan \"Lihat panduan\".",
    ],
  },
];

export function Walkthrough() {
  const user = useAuthStore((s) => s.user);
  const seen = useWalkthroughStore((s) => (user ? s.seenUserIds.includes(user.id) : true));
  const forcedOpen = useWalkthroughStore((s) => s.forcedOpen);
  const markSeen = useWalkthroughStore((s) => s.markSeen);
  const [index, setIndex] = useState(0);

  if (!user) return null;
  const visible = forcedOpen || !seen;
  const steps = STEPS.filter((step) => !step.roles || step.roles.includes(user.role));
  const step = steps[Math.min(index, steps.length - 1)];
  const isLast = index >= steps.length - 1;
  const Icon = step.icon;

  const close = () => {
    markSeen(user.id);
    setIndex(0);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.topRow}>
            <Text variant="caption">Langkah {index + 1} dari {steps.length}</Text>
            {!isLast ? (
              <Pressable onPress={close} hitSlop={12} accessibilityRole="button">
                <Text variant="body" color={colors.neutral700} style={styles.skip}>Lewati</Text>
              </Pressable>
            ) : null}
          </View>

          <View style={styles.iconWrap}>
            <Icon size={44} color={colors.actionFill} strokeWidth={2} />
          </View>
          <Text variant="h2" style={styles.title}>{step.title}</Text>
          {step.body.map((line) => (
            <Text key={line} variant="body" style={styles.line}>{line}</Text>
          ))}

          <View style={styles.dots}>
            {steps.map((s, i) => (
              <View key={s.title} style={[styles.dot, i === index && styles.dotActive]} />
            ))}
          </View>

          <View style={styles.actions}>
            {index > 0 ? (
              <Button title="Kembali" variant="secondary" onPress={() => setIndex(index - 1)} style={styles.action} />
            ) : null}
            <Button
              title={isLast ? "Mulai pakai" : "Lanjut"}
              onPress={isLast ? close : () => setIndex(index + 1)}
              style={styles.action}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(23,32,51,0.55)", justifyContent: "center", padding: space[4] },
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space[6] },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  skip: { fontWeight: "600", textDecorationLine: "underline" },
  iconWrap: {
    marginTop: space[4],
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.accent100,
    alignSelf: "center",
  },
  title: { marginTop: space[4], textAlign: "center" },
  line: { marginTop: space[3], fontSize: 17, lineHeight: 25 },
  dots: { flexDirection: "row", justifyContent: "center", gap: 8, marginTop: space[6] },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.neutral300 },
  dotActive: { width: 26, backgroundColor: colors.actionFill },
  actions: { flexDirection: "row", gap: space[3], marginTop: space[6] },
  action: { flex: 1 },
});
