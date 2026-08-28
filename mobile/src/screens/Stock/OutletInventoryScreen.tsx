import React, { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Switch, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatRupiah, OutletInventoryItem } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { colors, radius, space } from "../../theme/tokens";
import { apiErrorMessage } from "../../state/api/apiClient";
import { useInventory, useUpdateInventory } from "../../state/api/inventory";
import { useAccountSetup } from "../../state/api/account";
import { useOutletStore } from "../../state/outlet/outletStore";
import { useAuthStore } from "../../state/auth/authStore";
import type { StockStackParamList } from "../../app/stacks/StockStack";

type Props = NativeStackScreenProps<StockStackParamList, "OutletInventory">;

export function OutletInventoryScreen({ navigation }: Props) {
  const inventory = useInventory();
  const update = useUpdateInventory();
  const setup = useAccountSetup();
  const activeOutletId = useOutletStore((s) => s.activeOutletId);
  const tokenOutletId = useAuthStore((s) => s.user?.outletId ?? null);
  const outletName = useMemo(() => {
    const id = activeOutletId ?? tokenOutletId;
    return setup.data?.outlets.find((o) => o.id === id)?.name ?? "Outlet ini";
  }, [setup.data, activeOutletId, tokenOutletId]);

  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<OutletInventoryItem | null>(null);
  const [stock, setStock] = useState("");
  const [override, setOverride] = useState("");
  const [available, setAvailable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    const all = inventory.data ?? [];
    return q ? all.filter((i) => i.name.toLowerCase().includes(q)) : all;
  }, [inventory.data, query]);

  const openEditor = (item: OutletInventoryItem) => {
    setEditing(item);
    setStock(String(item.stockQty));
    setOverride(item.priceOverride == null ? "" : String(item.priceOverride));
    setAvailable(item.isAvailable);
    setError(null);
  };

  const save = async () => {
    if (!editing) return;
    setError(null);
    try {
      await update.mutateAsync({
        productId: editing.productId,
        body: {
          stockQty: Math.max(0, Number(stock.replace(/\D/g, "")) || 0),
          priceOverride: override.trim() === "" ? null : Math.max(0, Number(override.replace(/\D/g, "")) || 0),
          isAvailable: available,
        },
      });
      setEditing(null);
    } catch (err) {
      setError(apiErrorMessage(err, "Gagal menyimpan. Coba lagi."));
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={[]}>
      <View style={styles.header}>
        <Pressable onPress={navigation.goBack} style={styles.back}><ChevronLeft size={23} color={colors.text} /></Pressable>
        <View><Text variant="h2">Stok outlet</Text><Text variant="caption">{outletName}</Text></View>
      </View>

      <View style={styles.searchWrap}>
        <TextField value={query} onChangeText={setQuery} placeholder="Cari produk" autoCapitalize="none" autoCorrect={false} />
      </View>

      {inventory.isLoading ? (
        <ActivityIndicator style={styles.loading} color={colors.accent} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.productId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text variant="caption" color={colors.neutral600} style={styles.empty}>Tidak ada produk.</Text>}
          renderItem={({ item }) => {
            const low = item.stockQty <= item.lowStockThreshold;
            return (
              <Pressable style={styles.row} onPress={() => openEditor(item)}>
                <View style={styles.rowMain}>
                  <Text variant="body" numberOfLines={1} style={styles.rowName}>{item.name}</Text>
                  <Text variant="caption" color={colors.neutral600}>
                    {formatRupiah(item.effectivePrice)}
                    {item.priceOverride != null ? " · harga khusus" : ""}
                    {!item.isAvailable ? " · disembunyikan" : ""}
                  </Text>
                </View>
                <Text variant="tabular" color={low ? colors.accent700 : colors.text}>{item.stockQty}</Text>
              </Pressable>
            );
          }}
        />
      )}

      <Modal visible={!!editing} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <Text variant="h3">{editing?.name}</Text>
            <Text variant="caption" color={colors.neutral600}>Harga acuan {editing ? formatRupiah(editing.referenceSellPrice) : "-"}</Text>
            <View style={styles.fields}>
              <TextField label="Stok" value={stock} onChangeText={(v) => setStock(v.replace(/\D/g, ""))} keyboardType="number-pad" />
              <TextField label="Harga khusus outlet (kosongkan = ikut acuan)" value={override} onChangeText={(v) => setOverride(v.replace(/\D/g, ""))} keyboardType="number-pad" placeholder="—" />
            </View>
            <View style={styles.switchRow}>
              <Text variant="body">Tampilkan di kasir</Text>
              <Switch value={available} onValueChange={setAvailable} />
            </View>
            {error ? <Text variant="caption" color={colors.accent700} style={styles.err}>{error}</Text> : null}
            <View style={styles.actions}>
              <Button title="Batal" variant="secondary" onPress={() => setEditing(null)} style={styles.flex} />
              <Button title="Simpan" onPress={save} loading={update.isPending} style={styles.flex} />
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 64, flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[3], borderBottomWidth: 1, borderBottomColor: colors.divider },
  back: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  searchWrap: { padding: space[3] },
  loading: { marginTop: space[6] },
  list: { paddingHorizontal: space[3], paddingBottom: space[8] },
  empty: { textAlign: "center", marginTop: space[6] },
  row: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: colors.divider },
  rowMain: { flex: 1, minWidth: 0 },
  rowName: { fontWeight: "600" },
  backdrop: { flex: 1, backgroundColor: "rgba(23,32,51,0.35)", justifyContent: "center", padding: space[4] },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space[4] },
  fields: { marginTop: space[3], gap: space[3] },
  switchRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space[3] },
  err: { marginTop: space[2] },
  actions: { flexDirection: "row", gap: space[2], marginTop: space[4] },
  flex: { flex: 1 },
});
