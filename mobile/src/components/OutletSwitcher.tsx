import React, { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Building2, Check, ChevronDown } from "lucide-react-native";
import { useQueryClient } from "@tanstack/react-query";
import { Text } from "../theme/Text";
import { colors, radius, shadow, space } from "../theme/tokens";
import { useAccountSetup } from "../state/api/account";
import { useOutletStore } from "../state/outlet/outletStore";
import { useAuthStore } from "../state/auth/authStore";

/**
 * Header control showing the active outlet. Owners/managers can tap it to
 * switch outlets (which re-scopes every query); cashiers/stockers see it as a
 * static badge — they are pinned to their own outlet by the backend.
 */
export function OutletSwitcher() {
  const role = useAuthStore((s) => s.user?.role);
  const tokenOutletId = useAuthStore((s) => s.user?.outletId ?? null);
  const activeOutletId = useOutletStore((s) => s.activeOutletId);
  const setActiveOutlet = useOutletStore((s) => s.setActiveOutlet);
  const setup = useAccountSetup();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const canSwitch = role === "owner" || role === "manager";
  const outlets = useMemo(() => setup.data?.outlets ?? [], [setup.data]);
  const active = outlets.find((o) => o.id === (activeOutletId ?? tokenOutletId)) ?? outlets[0];

  if (outlets.length === 0) return null;

  const pick = (outletId: string) => {
    setActiveOutlet(outletId);
    setOpen(false);
    // Everything below is outlet-scoped on the backend — force a refetch.
    queryClient.invalidateQueries();
  };

  return (
    <>
      <Pressable
        onPress={() => canSwitch && outlets.length > 1 && setOpen(true)}
        style={styles.chip}
        accessibilityRole={canSwitch ? "button" : "text"}
        accessibilityLabel={`Outlet aktif: ${active?.name ?? "-"}`}
      >
        <Building2 size={14} color={colors.accent2} />
        <Text variant="caption" color={colors.text} style={styles.chipLabel} numberOfLines={1}>
          {active?.name ?? "Outlet"}
        </Text>
        {canSwitch && outlets.length > 1 ? <ChevronDown size={14} color={colors.neutral500} /> : null}
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            <Text variant="kicker" style={styles.sheetTitle}>PILIH OUTLET</Text>
            {outlets.map((o) => {
              const selected = o.id === (activeOutletId ?? tokenOutletId);
              return (
                <Pressable key={o.id} onPress={() => pick(o.id)} style={styles.row}>
                  <View style={styles.rowText}>
                    <Text variant="body" style={styles.rowName}>{o.name}</Text>
                    <Text variant="caption" color={colors.neutral600}>
                      Kode {o.code}{o.type === "franchise" ? " · Franchise" : ""}
                    </Text>
                  </View>
                  {selected ? <Check size={18} color={colors.accent2} /> : null}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: 180,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.divider,
    backgroundColor: colors.surface,
  },
  chipLabel: { fontWeight: "600", flexShrink: 1 },
  backdrop: { flex: 1, backgroundColor: "rgba(23,32,51,0.35)", justifyContent: "flex-start", paddingTop: 120, paddingHorizontal: space[4] },
  sheet: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: space[3], ...shadow.lg },
  sheetTitle: { marginBottom: space[2], paddingHorizontal: space[2] },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: space[3], paddingHorizontal: space[2], borderTopWidth: 1, borderTopColor: colors.divider },
  rowText: { flex: 1 },
  rowName: { fontWeight: "600" },
});
