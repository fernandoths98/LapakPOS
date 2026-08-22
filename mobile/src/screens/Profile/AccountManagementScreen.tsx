import React, { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Building2, ChevronLeft, Copy, Plus, UserRound } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { CreateStaffRequest, UserRole } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { colors, radius, space } from "../../theme/tokens";
import { useAccountSetup, useCreateOutlet, useCreateStaff } from "../../state/api/account";
import type { HomeStackParamList } from "../../app/stacks/HomeStack";

type Props = NativeStackScreenProps<HomeStackParamList, "AccountManagement">;
type FormMode = "outlet" | "staff" | null;
const ROLE_LABEL: Record<UserRole, string> = { owner: "Pemilik", manager: "Manager", cashier: "Kasir", stocker: "Staf stok" };

export function AccountManagementScreen({ navigation }: Props) {
  const setup = useAccountSetup();
  const createOutlet = useCreateOutlet();
  const createStaff = useCreateStaff();
  const [form, setForm] = useState<FormMode>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState<Exclude<UserRole, "owner">>("cashier");
  const [outletId, setOutletId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => { setForm(null); setName(""); setCode(""); setPhone(""); setAddress(""); setEmail(""); setPin(""); setRole("cashier"); setError(null); };
  const showOutletForm = () => { resetForm(); setForm("outlet"); };
  const showStaffForm = () => { resetForm(); setOutletId(setup.data?.outlets[0]?.id ?? ""); setForm("staff"); };
  const submitOutlet = async () => {
    setError(null); try { await createOutlet.mutateAsync({ name: name.trim(), code: code.trim(), phone: phone.trim() || undefined, address: address.trim() || undefined }); resetForm(); } catch { setError("Outlet gagal dibuat. Pastikan kode belum digunakan."); }
  };
  const submitStaff = async () => {
    setError(null); try { const body: CreateStaffRequest = { name: name.trim(), email: email.trim() || undefined, role, outletId, pin }; await createStaff.mutateAsync(body); resetForm(); } catch { setError("Staf gagal dibuat. Periksa email, outlet, dan PIN."); }
  };

  if (setup.isLoading) return <SafeAreaView style={styles.loading} edges={[]}><ActivityIndicator color={colors.accent} /></SafeAreaView>;
  if (!setup.data) return <SafeAreaView style={styles.loading} edges={[]}><Text variant="body" color={colors.accent700}>Data usaha gagal dimuat.</Text></SafeAreaView>;
  const data = setup.data;
  const trialDays = data.subscription ? Math.max(0, Math.ceil((new Date(data.subscription.trialEndsAt).getTime() - Date.now()) / 86_400_000)) : 0;

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <View style={styles.header}><Pressable onPress={navigation.goBack} style={styles.backButton}><ChevronLeft size={23} color={colors.text} /></Pressable><View><Text variant="h2">Kelola usaha</Text><Text variant="caption">Outlet, staf, dan akses kasir</Text></View></View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.accountCard}>
          <View style={styles.accountTop}><View><Text variant="kicker">KODE USAHA</Text><Text variant="h3" style={styles.slug}>{data.merchant.slug ?? "-"}</Text></View><Copy size={18} color={colors.neutral500} /></View>
          <Text variant="caption" color={colors.neutral600}>Kode ini digunakan staf saat masuk dengan PIN.</Text>
          <View style={styles.planRow}><Text variant="body">Paket {data.subscription?.planCode.toUpperCase() ?? "-"}</Text><Text variant="caption" color={trialDays <= 3 ? colors.accent700 : colors.success}>{data.subscription?.status === "trialing" ? `${trialDays} hari trial tersisa` : data.subscription?.status ?? "Belum aktif"}</Text></View>
        </View>

        <SectionHeader title="OUTLET" action="Tambah" onPress={showOutletForm} />
        {form === "outlet" ? <View style={styles.formCard}><Text variant="h3">Outlet baru</Text><View style={styles.fields}><TextField label="Nama outlet" value={name} onChangeText={setName} placeholder="Cabang Sudirman" /><TextField label="Kode outlet" value={code} onChangeText={(v) => setCode(v.toUpperCase().replace(/[^A-Z0-9_-]/g, "").slice(0, 12))} placeholder="SUDIRMAN" autoCapitalize="characters" /><TextField label="Telepon" value={phone} onChangeText={setPhone} placeholder="Opsional" keyboardType="phone-pad" /><TextField label="Alamat" value={address} onChangeText={setAddress} placeholder="Opsional" /></View>{error ? <ErrorText text={error} /> : null}<View style={styles.formActions}><Button title="Batal" variant="secondary" onPress={resetForm} style={styles.flexButton} /><Button title="Simpan outlet" onPress={submitOutlet} disabled={name.trim().length < 2 || code.length < 2} loading={createOutlet.isPending} style={styles.flexButton} /></View></View> : null}
        {data.outlets.map((outlet) => <View key={outlet.id} style={styles.rowCard}><View style={styles.rowIcon}><Building2 size={20} color={colors.text} /></View><View style={styles.rowCopy}><View style={styles.nameRow}><Text variant="body" style={styles.rowName}>{outlet.name}</Text>{outlet.isPrimary ? <Text variant="caption" color={colors.accent2}>UTAMA</Text> : null}</View><Text variant="caption" color={colors.neutral600}>Kode {outlet.code}{outlet.address ? ` · ${outlet.address}` : ""}</Text></View></View>)}

        <SectionHeader title="STAF" action="Tambah" onPress={showStaffForm} />
        {form === "staff" ? <View style={styles.formCard}><Text variant="h3">Staf baru</Text><View style={styles.fields}><TextField label="Nama staf" value={name} onChangeText={setName} placeholder="Nama lengkap" /><TextField label="Email" value={email} onChangeText={setEmail} placeholder="Opsional untuk login email" autoCapitalize="none" keyboardType="email-address" /><TextField label="PIN kasir" value={pin} onChangeText={(v) => setPin(v.replace(/\D/g, "").slice(0, 6))} placeholder="4–6 digit" keyboardType="number-pad" secureTextEntry /></View><Text variant="kicker" style={styles.inputLabel}>PERAN</Text><View style={styles.choiceRow}>{(["cashier", "manager", "stocker"] as const).map((item) => <Choice key={item} label={ROLE_LABEL[item]} active={role === item} onPress={() => setRole(item)} />)}</View><Text variant="kicker" style={styles.inputLabel}>OUTLET</Text><View style={styles.choiceRow}>{data.outlets.map((outlet) => <Choice key={outlet.id} label={outlet.code} active={outletId === outlet.id} onPress={() => setOutletId(outlet.id)} />)}</View>{error ? <ErrorText text={error} /> : null}<View style={styles.formActions}><Button title="Batal" variant="secondary" onPress={resetForm} style={styles.flexButton} /><Button title="Simpan staf" onPress={submitStaff} disabled={name.trim().length < 2 || pin.length < 4 || !outletId} loading={createStaff.isPending} style={styles.flexButton} /></View></View> : null}
        {data.staff.map((staff) => <View key={staff.id} style={styles.rowCard}><View style={styles.rowIcon}><UserRound size={20} color={colors.text} /></View><View style={styles.rowCopy}><View style={styles.nameRow}><Text variant="body" style={styles.rowName}>{staff.name}</Text><Text variant="caption" color={staff.isActive ? colors.success : colors.neutral500}>{staff.isActive ? "AKTIF" : "NONAKTIF"}</Text></View><Text variant="caption" color={colors.neutral600}>{ROLE_LABEL[staff.role]} · {data.outlets.find((o) => o.id === staff.outletId)?.code ?? "Semua outlet"}</Text></View></View>)}
      </ScrollView>
    </SafeAreaView>
  );
}

function SectionHeader({ title, action, onPress }: { title: string; action: string; onPress: () => void }) { return <View style={styles.sectionHeader}><Text variant="kicker">{title}</Text><Pressable onPress={onPress} style={styles.addButton}><Plus size={16} color={colors.accent2} /><Text variant="caption" color={colors.accent2}>{action}</Text></Pressable></View>; }
function Choice({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) { return <Pressable onPress={onPress} style={[styles.choice, active && styles.choiceActive]}><Text variant="caption" color={active ? colors.accent2 : colors.neutral700}>{label}</Text></Pressable>; }
function ErrorText({ text }: { text: string }) { return <Text variant="caption" color={colors.accent700} style={styles.error}>{text}</Text>; }

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg }, loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  header: { minHeight: 64, flexDirection: "row", alignItems: "center", paddingHorizontal: space[3], gap: space[2], borderBottomWidth: 1, borderBottomColor: colors.divider }, backButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  content: { padding: space[4], paddingBottom: space[8] }, accountCard: { padding: space[4], backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.divider, borderRadius: radius.md }, accountTop: { flexDirection: "row", justifyContent: "space-between" }, slug: { marginTop: 4 }, planRow: { marginTop: space[3], paddingTop: space[3], borderTopWidth: 1, borderTopColor: colors.divider, flexDirection: "row", justifyContent: "space-between" },
  sectionHeader: { marginTop: space[6], marginBottom: space[2], flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, addButton: { flexDirection: "row", alignItems: "center", gap: 4, padding: 6 },
  rowCard: { minHeight: 64, padding: space[3], backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.divider, flexDirection: "row", alignItems: "center" }, rowIcon: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: colors.neutral200, alignItems: "center", justifyContent: "center" }, rowCopy: { flex: 1, marginLeft: space[3] }, nameRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" }, rowName: { fontWeight: "600" },
  formCard: { padding: space[4], marginBottom: space[3], borderWidth: 1, borderColor: colors.accent2200, borderRadius: radius.md, backgroundColor: colors.surface }, fields: { marginTop: space[3], gap: space[3] }, formActions: { flexDirection: "row", gap: space[2], marginTop: space[4] }, flexButton: { flex: 1 }, error: { marginTop: space[3] }, inputLabel: { marginTop: space[4], marginBottom: space[2] }, choiceRow: { flexDirection: "row", flexWrap: "wrap", gap: space[2] }, choice: { minHeight: 36, paddingHorizontal: space[3], borderRadius: radius.sm, borderWidth: 1, borderColor: colors.divider, alignItems: "center", justifyContent: "center" }, choiceActive: { borderColor: colors.accent2, backgroundColor: colors.accent2100 },
});
