import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Switch, View } from "react-native";
import { ChevronLeft, Share2 } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatRupiah } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { PlanUpsell } from "../../components/PlanUpsell";
import { colors, radius, space } from "../../theme/tokens";
import { apiErrorMessage } from "../../state/api/apiClient";
import { useAccountSetup } from "../../state/api/account";
import { useEntitlements } from "../../state/api/subscription";
import {
  useCreatePartnerInvite,
  useFranchiseAgreements,
  useFranchiseStatements,
  useGeneratePartnerStatements,
  useGenerateStatements,
  useJoinFranchise,
  useMembership,
  usePartners,
  usePartnerStatements,
  useSetPartnerStatementStatus,
  useSetStatementStatus,
  useUpsertFranchiseAgreement,
} from "../../state/api/franchise";
import type { HomeStackParamList } from "../../app/stacks/HomeStack";

type Props = NativeStackScreenProps<HomeStackParamList, "Franchise">;

const STATUS_LABEL = { draft: "Draf", issued: "Ditagih", paid: "Lunas" } as const;

function StatusBadge({ status }: { status: "draft" | "issued" | "paid" }) {
  const style = status === "paid" ? styles.badgePaid : status === "issued" ? styles.badgeIssued : styles.badgeDraft;
  const color = status === "paid" ? colors.success : status === "issued" ? colors.accent2 : colors.neutral600;
  return (
    <View style={[styles.badge, style]}>
      <Text variant="caption" color={color}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

export function FranchiseScreen({ navigation }: Props) {
  const entitlements = useEntitlements();
  const hasFranchise = entitlements.data?.entitlements.franchise ?? false;

  const setup = useAccountSetup();
  const membership = useMembership();
  const join = useJoinFranchise();
  const [joinCode, setJoinCode] = useState("");

  const agreements = useFranchiseAgreements(hasFranchise);
  const outletStatements = useFranchiseStatements(hasFranchise);
  const upsert = useUpsertFranchiseAgreement();
  const genOutlet = useGenerateStatements();
  const setOutletStatus = useSetStatementStatus();

  const partners = usePartners(hasFranchise);
  const partnerStatements = usePartnerStatements(hasFranchise);
  const createInvite = useCreatePartnerInvite();
  const genPartner = useGeneratePartnerStatements();
  const setPartnerStatus = useSetPartnerStatementStatus();

  const [formOutletId, setFormOutletId] = useState("");
  const [royalty, setRoyalty] = useState("5");
  const [fee, setFee] = useState("0");
  const [allowOverride, setAllowOverride] = useState(false);
  const [inviteRoyalty, setInviteRoyalty] = useState("5");
  const [inviteFee, setInviteFee] = useState("0");
  const [inviteLabel, setInviteLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const franchiseOutlets = useMemo(
    () => (setup.data?.outlets ?? []).filter((o) => o.type === "franchise"),
    [setup.data],
  );

  const editAgreement = (outletId: string) => {
    const a = agreements.data?.find((x) => x.outletId === outletId);
    setFormOutletId(outletId);
    setRoyalty(String(a?.royaltyPercent ?? 5));
    setFee(String(a?.feeMonthly ?? 0));
    setAllowOverride(a?.allowPriceOverride ?? false);
    setError(null);
  };

  const submitAgreement = async () => {
    setError(null);
    try {
      await upsert.mutateAsync({
        outletId: formOutletId,
        royaltyPercent: Math.max(0, Math.min(100, Number(royalty) || 0)),
        feeMonthly: Math.max(0, Number(fee.replace(/\D/g, "")) || 0),
        allowPriceOverride: allowOverride,
      });
      setFormOutletId("");
    } catch (err) {
      setError(apiErrorMessage(err, "Perjanjian gagal disimpan."));
    }
  };

  const submitJoin = async () => {
    setError(null);
    try {
      await join.mutateAsync(joinCode.trim());
      setJoinCode("");
    } catch (err) {
      setError(apiErrorMessage(err, "Kode tidak valid."));
    }
  };

  const makeInvite = async () => {
    try {
      const res = await createInvite.mutateAsync({
        label: inviteLabel.trim() || undefined,
        royaltyPercent: Math.max(0, Math.min(100, Number(inviteRoyalty) || 0)),
        feeMonthly: Math.max(0, Number(inviteFee.replace(/\D/g, "")) || 0),
      });
      setInviteLabel("");
      Alert.alert("Kode undangan", `Bagikan kode ini ke franchisee:\n\n${res.joinCode}`);
    } catch (err) {
      Alert.alert("Gagal", apiErrorMessage(err, "Kode gagal dibuat."));
    }
  };

  const runGen = async (which: "outlet" | "partner") => {
    try {
      const res = which === "outlet" ? await genOutlet.mutateAsync({}) : await genPartner.mutateAsync({});
      Alert.alert("Statement dibuat", `${res.created} baru, ${res.updated} diperbarui.`);
    } catch (err) {
      Alert.alert("Gagal", apiErrorMessage(err, "Statement gagal dibuat."));
    }
  };

  if (entitlements.isLoading || membership.isLoading) {
    return <SafeAreaView style={styles.loading} edges={[]}><ActivityIndicator color={colors.accent} /></SafeAreaView>;
  }

  const mine = membership.data;

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <View style={styles.header}>
        <Pressable onPress={navigation.goBack} style={styles.back}><ChevronLeft size={23} color={colors.text} /></Pressable>
        <View><Text variant="h2">Franchise</Text><Text variant="caption">Keanggotaan, cabang &amp; royalti</Text></View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* ── Membership ── */}
        <Text variant="kicker" style={styles.sectionTitle}>KEANGGOTAAN</Text>
        {mine?.isFranchisee ? (
          <View style={styles.card}>
            <Text variant="body" style={styles.bold}>Franchise dari {mine.franchisorName}</Text>
            <Text variant="caption" color={colors.neutral600}>
              Royalti {mine.royaltyPercent}% + {formatRupiah(mine.feeMonthly ?? 0)}/bln · status {mine.status}
            </Text>
            {(mine.statements ?? []).length > 0 ? (
              <View style={styles.subList}>
                {mine.statements.map((s) => (
                  <View key={s.id} style={styles.subRow}>
                    <Text variant="caption" color={colors.neutral700}>
                      {new Date(s.periodStart).toLocaleDateString("id-ID", { month: "short", year: "numeric" })} · {formatRupiah(s.totalDue)}
                    </Text>
                    <StatusBadge status={s.status} />
                  </View>
                ))}
              </View>
            ) : (
              <Text variant="caption" color={colors.neutral500} style={styles.hint}>Belum ada tagihan royalti.</Text>
            )}
          </View>
        ) : (
          <View style={styles.card}>
            <Text variant="body">Punya kode dari pusat?</Text>
            <View style={styles.joinRow}>
              <View style={styles.joinInput}>
                <TextField value={joinCode} onChangeText={(v) => setJoinCode(v.toUpperCase())} placeholder="FR-XXXXXXXX" autoCapitalize="characters" autoCorrect={false} />
              </View>
              <Button title="Gabung" onPress={submitJoin} loading={join.isPending} disabled={joinCode.trim().length < 4} style={styles.joinButton} />
            </View>
          </View>
        )}

        {/* ── Franchisor tools (Pro) ── */}
        {!hasFranchise ? (
          <PlanUpsell
            title="Kelola franchise di paket Pro"
            message="Buat perjanjian royalti untuk cabang milik sendiri maupun mitra franchisee terpisah, lalu tagih otomatis dari penjualan mereka."
            onUpgrade={() => navigation.navigate("Subscription")}
          />
        ) : (
          <>
            {/* Outlet-level franchise branches */}
            <Text variant="kicker" style={styles.sectionTitle}>CABANG FRANCHISE (OUTLET SENDIRI)</Text>
            {franchiseOutlets.length === 0 ? (
              <Text variant="caption" color={colors.neutral600} style={styles.hint}>
                Belum ada outlet bertipe franchise. Tambahkan di "Kelola usaha" dengan jenis Franchise.
              </Text>
            ) : (
              franchiseOutlets.map((o) => {
                const a = agreements.data?.find((x) => x.outletId === o.id);
                return (
                  <Pressable key={o.id} style={styles.card} onPress={() => editAgreement(o.id)}>
                    <View style={styles.cardTop}>
                      <Text variant="body" style={styles.bold}>{o.name}</Text>
                      <Text variant="caption" color={a ? colors.success : colors.neutral500}>
                        {a ? `${a.royaltyPercent}% + ${formatRupiah(a.feeMonthly)}/bln` : "Belum ada perjanjian"}
                      </Text>
                    </View>
                  </Pressable>
                );
              })
            )}
            {formOutletId ? (
              <View style={styles.formCard}>
                <Text variant="h3">{franchiseOutlets.find((o) => o.id === formOutletId)?.name}</Text>
                <View style={styles.fields}>
                  <TextField label="Royalti (%)" value={royalty} onChangeText={(v) => setRoyalty(v.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" />
                  <TextField label="Biaya tetap / bulan (Rp)" value={fee} onChangeText={(v) => setFee(v.replace(/\D/g, ""))} keyboardType="number-pad" />
                </View>
                <View style={styles.switchRow}>
                  <Text variant="body">Boleh atur harga sendiri</Text>
                  <Switch value={allowOverride} onValueChange={setAllowOverride} />
                </View>
                {error ? <Text variant="caption" color={colors.accent700} style={styles.hint}>{error}</Text> : null}
                <View style={styles.formActions}>
                  <Button title="Batal" variant="secondary" onPress={() => setFormOutletId("")} style={styles.flex} />
                  <Button title="Simpan" onPress={submitAgreement} loading={upsert.isPending} style={styles.flex} />
                </View>
              </View>
            ) : null}

            <View style={styles.rowBetween}>
              <Text variant="kicker" style={styles.sectionTitle}>ROYALTI OUTLET (BULAN LALU)</Text>
              <Button title="Buat" variant="secondary" onPress={() => runGen("outlet")} loading={genOutlet.isPending} style={styles.genButton} />
            </View>
            {(outletStatements.data ?? []).length === 0 ? (
              <Text variant="caption" color={colors.neutral600} style={styles.hint}>Belum ada statement.</Text>
            ) : (
              (outletStatements.data ?? []).map((s) => (
                <View key={s.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text variant="body" style={styles.bold}>{s.outletName}</Text>
                    <StatusBadge status={s.status} />
                  </View>
                  <Text variant="caption" color={colors.neutral600}>
                    {new Date(s.periodStart).toLocaleDateString("id-ID", { month: "short", year: "numeric" })} · omzet {formatRupiah(s.grossSales)}
                  </Text>
                  <Text variant="body" style={styles.dueLine}>
                    Tagihan {formatRupiah(s.totalDue)}{" "}
                    <Text variant="caption" color={colors.neutral500}>(royalti {formatRupiah(s.royaltyDue)} + fee {formatRupiah(s.feeDue)})</Text>
                  </Text>
                  {s.status !== "paid" ? (
                    <View style={styles.formActions}>
                      {s.status === "draft" ? (
                        <Button title="Tagih" variant="secondary" onPress={() => setOutletStatus.mutate({ id: s.id, status: "issued" })} style={styles.flex} />
                      ) : null}
                      <Button title="Tandai lunas" onPress={() => setOutletStatus.mutate({ id: s.id, status: "paid" })} style={styles.flex} />
                    </View>
                  ) : null}
                </View>
              ))
            )}

            {/* Inter-tenant franchisee partners */}
            <Text variant="kicker" style={styles.sectionTitle}>MITRA FRANCHISE (USAHA TERPISAH)</Text>
            {(partners.data ?? []).map((p) => (
              <View key={p.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text variant="body" style={styles.bold}>{p.franchiseeName ?? p.label ?? "Undangan"}</Text>
                  <Text variant="caption" color={p.status === "active" ? colors.success : p.status === "pending" ? colors.warning : colors.neutral500}>
                    {p.status === "pending" ? "Menunggu" : p.status === "active" ? "Aktif" : "Berakhir"}
                  </Text>
                </View>
                <Text variant="caption" color={colors.neutral600}>
                  {p.royaltyPercent}% + {formatRupiah(p.feeMonthly)}/bln
                  {p.status === "active" ? ` · omzet bln ini ${formatRupiah(p.revenueThisMonth)}` : ""}
                </Text>
                {p.status === "pending" ? (
                  <Pressable
                    style={styles.codeRow}
                    onPress={() => Share.share({ message: `Kode franchise ${p.joinCode} — masukkan di LapakPOS: Kelola usaha › Franchise › Gabung.` })}
                  >
                    <Text variant="tabular" style={styles.code}>{p.joinCode}</Text>
                    <Share2 size={15} color={colors.accent2} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            <View style={styles.formCard}>
              <Text variant="h3">Undang franchisee baru</Text>
              <View style={styles.fields}>
                <TextField label="Nama (opsional)" value={inviteLabel} onChangeText={setInviteLabel} placeholder="Cabang Pak Slamet" />
                <TextField label="Royalti (%)" value={inviteRoyalty} onChangeText={(v) => setInviteRoyalty(v.replace(/\D/g, "").slice(0, 3))} keyboardType="number-pad" />
                <TextField label="Biaya tetap / bulan (Rp)" value={inviteFee} onChangeText={(v) => setInviteFee(v.replace(/\D/g, ""))} keyboardType="number-pad" />
              </View>
              <Button title="Buat kode undangan" onPress={makeInvite} loading={createInvite.isPending} style={styles.formActions} />
            </View>

            <View style={styles.rowBetween}>
              <Text variant="kicker" style={styles.sectionTitle}>ROYALTI MITRA (BULAN LALU)</Text>
              <Button title="Buat" variant="secondary" onPress={() => runGen("partner")} loading={genPartner.isPending} style={styles.genButton} />
            </View>
            {(partnerStatements.data ?? []).length === 0 ? (
              <Text variant="caption" color={colors.neutral600} style={styles.hint}>Belum ada statement mitra.</Text>
            ) : (
              (partnerStatements.data ?? []).map((s) => (
                <View key={s.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <Text variant="body" style={styles.bold}>{s.franchiseeName ?? "Mitra"}</Text>
                    <StatusBadge status={s.status} />
                  </View>
                  <Text variant="caption" color={colors.neutral600}>
                    {new Date(s.periodStart).toLocaleDateString("id-ID", { month: "short", year: "numeric" })} · omzet {formatRupiah(s.grossSales)}
                  </Text>
                  <Text variant="body" style={styles.dueLine}>Tagihan {formatRupiah(s.totalDue)}</Text>
                  {s.status !== "paid" ? (
                    <View style={styles.formActions}>
                      {s.status === "draft" ? (
                        <Button title="Tagih" variant="secondary" onPress={() => setPartnerStatus.mutate({ id: s.id, status: "issued" })} style={styles.flex} />
                      ) : null}
                      <Button title="Tandai lunas" onPress={() => setPartnerStatus.mutate({ id: s.id, status: "paid" })} style={styles.flex} />
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  header: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[3], borderBottomWidth: 1, borderBottomColor: colors.divider },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  content: { padding: space[4], paddingBottom: space[8] },
  sectionTitle: { marginTop: space[6], marginBottom: space[2] },
  hint: { marginTop: space[1] },
  card: { padding: space[3], marginBottom: space[2], backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  bold: { fontWeight: "600", flexShrink: 1 },
  dueLine: { marginTop: 4, fontWeight: "600" },
  formCard: { padding: space[4], marginVertical: space[2], borderWidth: 1, borderColor: colors.accent2200, borderRadius: radius.md, backgroundColor: colors.surface },
  fields: { marginTop: space[3], gap: space[3] },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space[3] },
  formActions: { flexDirection: "row", gap: space[2], marginTop: space[3] },
  flex: { flex: 1 },
  genButton: { minHeight: 34, paddingHorizontal: space[3] },
  joinRow: { flexDirection: "row", gap: space[2], marginTop: space[2], alignItems: "flex-end" },
  joinInput: { flex: 1 },
  joinButton: { minHeight: 46 },
  subList: { marginTop: space[2], borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: space[2], gap: space[1] },
  subRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  codeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: space[2], alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm, backgroundColor: colors.accent2100 },
  code: { fontWeight: "700", letterSpacing: 1 },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 },
  badgeDraft: { backgroundColor: colors.neutral200 },
  badgeIssued: { backgroundColor: colors.accent2100 },
  badgePaid: { backgroundColor: "#EAF8F0" },
});
