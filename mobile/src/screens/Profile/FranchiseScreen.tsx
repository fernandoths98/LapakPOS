import React, { useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatRupiah, FranchiseRoyaltyStatementDto } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { PlanUpsell } from "../../components/PlanUpsell";
import { colors, radius, space } from "../../theme/tokens";
import { apiErrorMessage } from "../../state/api/apiClient";
import { useAccountSetup } from "../../state/api/account";
import { useEntitlements } from "../../state/api/subscription";
import {
  useFranchiseAgreements,
  useFranchiseStatements,
  useGenerateStatements,
  useSetStatementStatus,
  useUpsertFranchiseAgreement,
} from "../../state/api/franchise";
import type { HomeStackParamList } from "../../app/stacks/HomeStack";

type Props = NativeStackScreenProps<HomeStackParamList, "Franchise">;

const STATUS_LABEL: Record<FranchiseRoyaltyStatementDto["status"], string> = {
  draft: "Draf",
  issued: "Ditagih",
  paid: "Lunas",
};

export function FranchiseScreen({ navigation }: Props) {
  const entitlements = useEntitlements();
  const hasFranchise = entitlements.data?.entitlements.franchise ?? false;

  const setup = useAccountSetup();
  const agreements = useFranchiseAgreements(hasFranchise);
  const statements = useFranchiseStatements(hasFranchise);
  const upsert = useUpsertFranchiseAgreement();
  const generate = useGenerateStatements();
  const setStatus = useSetStatementStatus();

  const [formOutletId, setFormOutletId] = useState("");
  const [royalty, setRoyalty] = useState("5");
  const [fee, setFee] = useState("0");
  const [allowOverride, setAllowOverride] = useState(false);
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

  const submit = async () => {
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

  const runGenerate = async () => {
    try {
      const res = await generate.mutateAsync({});
      Alert.alert("Statement dibuat", `${res.created} baru, ${res.updated} diperbarui.`);
    } catch (err) {
      Alert.alert("Gagal", apiErrorMessage(err, "Statement gagal dibuat."));
    }
  };

  if (entitlements.isLoading) {
    return <SafeAreaView style={styles.loading} edges={[]}><ActivityIndicator color={colors.accent} /></SafeAreaView>;
  }

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <View style={styles.header}>
        <Pressable onPress={navigation.goBack} style={styles.back}><ChevronLeft size={23} color={colors.text} /></Pressable>
        <View><Text variant="h2">Franchise</Text><Text variant="caption">Perjanjian &amp; royalti cabang</Text></View>
      </View>

      {!hasFranchise ? (
        <PlanUpsell
          title="Sistem franchise ada di paket Pro"
          message="Kelola perjanjian royalti tiap cabang franchise dan tagih otomatis dari penjualan mereka."
          onUpgrade={() => navigation.navigate("Subscription")}
        />
      ) : (
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text variant="kicker" style={styles.sectionTitle}>OUTLET FRANCHISE</Text>
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
                  <Text variant="caption" color={colors.neutral600}>
                    Kode {o.code}{a?.allowPriceOverride ? " · boleh atur harga sendiri" : a ? " · harga dari pusat" : ""}
                  </Text>
                </Pressable>
              );
            })
          )}

          {formOutletId ? (
            <View style={styles.formCard}>
              <Text variant="h3">Perjanjian: {franchiseOutlets.find((o) => o.id === formOutletId)?.name}</Text>
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
                <Button title="Simpan" onPress={submit} loading={upsert.isPending} style={styles.flex} />
              </View>
            </View>
          ) : null}

          <View style={styles.statementsHead}>
            <Text variant="kicker" style={styles.sectionTitle}>ROYALTI (BULAN LALU)</Text>
            <Button title="Buat statement" variant="secondary" onPress={runGenerate} loading={generate.isPending} style={styles.genButton} />
          </View>
          {(statements.data ?? []).length === 0 ? (
            <Text variant="caption" color={colors.neutral600} style={styles.hint}>Belum ada statement.</Text>
          ) : (
            (statements.data ?? []).map((s) => (
              <View key={s.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <Text variant="body" style={styles.bold}>{s.outletName}</Text>
                  <View style={[styles.badge, s.status === "paid" ? styles.badgePaid : s.status === "issued" ? styles.badgeIssued : styles.badgeDraft]}>
                    <Text variant="caption" color={s.status === "paid" ? colors.success : s.status === "issued" ? colors.accent2 : colors.neutral600}>{STATUS_LABEL[s.status]}</Text>
                  </View>
                </View>
                <Text variant="caption" color={colors.neutral600}>
                  {new Date(s.periodStart).toLocaleDateString("id-ID", { month: "short", year: "numeric" })} ·
                  omzet {formatRupiah(s.grossSales)}
                </Text>
                <Text variant="body" style={styles.dueLine}>
                  Tagihan {formatRupiah(s.totalDue)}{" "}
                  <Text variant="caption" color={colors.neutral500}>
                    (royalti {formatRupiah(s.royaltyDue)} + fee {formatRupiah(s.feeDue)})
                  </Text>
                </Text>
                {s.status !== "paid" ? (
                  <View style={styles.formActions}>
                    {s.status === "draft" ? (
                      <Button title="Tagih" variant="secondary" onPress={() => setStatus.mutate({ id: s.id, status: "issued" })} style={styles.flex} />
                    ) : null}
                    <Button title="Tandai lunas" onPress={() => setStatus.mutate({ id: s.id, status: "paid" })} style={styles.flex} />
                  </View>
                ) : null}
              </View>
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  header: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[3], borderBottomWidth: 1, borderBottomColor: colors.divider },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  content: { padding: space[4], paddingBottom: space[8] },
  sectionTitle: { marginTop: space[4], marginBottom: space[2] },
  hint: { marginTop: space[1] },
  card: { padding: space[3], marginBottom: space[2], backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  bold: { fontWeight: "600" },
  dueLine: { marginTop: 4, fontWeight: "600" },
  formCard: { padding: space[4], marginVertical: space[2], borderWidth: 1, borderColor: colors.accent2200, borderRadius: radius.md, backgroundColor: colors.surface },
  fields: { marginTop: space[3], gap: space[3] },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space[3] },
  formActions: { flexDirection: "row", gap: space[2], marginTop: space[3] },
  flex: { flex: 1 },
  statementsHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  genButton: { minHeight: 36, paddingHorizontal: space[3] },
  badge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 12 },
  badgeDraft: { backgroundColor: colors.neutral200 },
  badgeIssued: { backgroundColor: colors.accent2100 },
  badgePaid: { backgroundColor: "#EAF8F0" },
});
