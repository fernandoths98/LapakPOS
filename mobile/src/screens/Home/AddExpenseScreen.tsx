import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { parseRupiah } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { colors, space } from "../../theme/tokens";
import { useCreateExpense } from "../../state/api/expenses";
import { HomeStackParamList } from "../../app/stacks/HomeStack";

function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message ?? fallback;
}

/** Minimal add-expense form. The Home dashboard that lists these is a separate, later round. */
export function AddExpenseScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const createExpense = useCreateExpense();

  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [amountError, setAmountError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSave = async () => {
    setSubmitError(null);
    const amountNum = parseRupiah(amount);
    if (amount.trim() === "" || amountNum <= 0) {
      setAmountError("Masukkan nominal lebih dari 0");
      return;
    }
    setAmountError(null);

    try {
      await createExpense.mutateAsync({ amount: amountNum, note: note.trim() || undefined });
      navigation.goBack();
    } catch (err) {
      setSubmitError(extractErrorMessage(err, "Pengeluaran gagal disimpan. Periksa koneksi lalu coba lagi."));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="h2">Catat pengeluaran</Text>
      <Text variant="body" color={colors.neutral700} style={styles.intro}>
        Nominal dicatat pada shift aktif dan mengurangi kas yang seharusnya ada di laci.
      </Text>

      <View style={styles.fields}>
        <TextField
          label="Nominal"
          value={amount}
          onChangeText={(v) => {
            setAmount(v);
            setAmountError(null);
          }}
          placeholder="0"
          keyboardType="numeric"
          error={amountError ?? undefined}
        />

        <TextField label="Keterangan" value={note} onChangeText={setNote} placeholder="Contoh: beli kantong plastik (opsional)" />
      </View>

      {submitError ? (
        <Text variant="caption" color={colors.accent700} style={styles.submitError}>
          {submitError}
        </Text>
      ) : null}

      <Button
        title={createExpense.isPending ? "Menyimpan…" : "Simpan pengeluaran"}
        onPress={handleSave}
        disabled={createExpense.isPending}
        loading={createExpense.isPending}
        fullWidth
        style={styles.saveButton}
      />
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space[4], paddingBottom: space[8] },
  intro: { marginTop: space[2] },
  fields: { marginTop: space[4], gap: space[3] },
  submitError: { marginTop: space[3] },
  saveButton: { marginTop: space[6] },
});
