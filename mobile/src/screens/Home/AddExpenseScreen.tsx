import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { parseRupiah } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { colors, radius, space } from "../../theme/tokens";
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

  const handleSnapNote = () => {
    Alert.alert("Coming soon", "AI expense capture from a photo is coming in a later update.");
  };

  const handleSave = async () => {
    setSubmitError(null);
    const amountNum = parseRupiah(amount);
    if (amount.trim() === "" || amountNum <= 0) {
      setAmountError("Enter an amount greater than 0");
      return;
    }
    setAmountError(null);

    try {
      await createExpense.mutateAsync({ amount: amountNum, note: note.trim() || undefined });
      navigation.goBack();
    } catch (err) {
      setSubmitError(extractErrorMessage(err, "Couldn't save the expense. Check your connection and try again."));
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="h2">Add expense</Text>
      <Text variant="body" color={colors.neutral700} style={styles.intro}>
        Recorded against your current shift and counted as paid out of the drawer.
      </Text>

      <View style={styles.snapCard}>
        <Text variant="kicker">Snap a note</Text>
        <Text variant="caption" color={colors.neutral700} style={styles.snapBody}>
          Photograph a receipt and AI logs the expense for you.
        </Text>
        <Button title="Try it" variant="ghost" onPress={handleSnapNote} style={styles.snapButton} />
      </View>

      <View style={styles.fields}>
        <TextField
          label="Amount"
          value={amount}
          onChangeText={(v) => {
            setAmount(v);
            setAmountError(null);
          }}
          placeholder="0"
          keyboardType="numeric"
          error={amountError ?? undefined}
        />

        <TextField label="Note" value={note} onChangeText={setNote} placeholder="What was this for? (optional)" />
      </View>

      {submitError ? (
        <Text variant="caption" color={colors.accent700} style={styles.submitError}>
          {submitError}
        </Text>
      ) : null}

      <Button
        title={createExpense.isPending ? "Saving…" : "Save expense"}
        onPress={handleSave}
        disabled={createExpense.isPending}
        loading={createExpense.isPending}
        fullWidth
        style={styles.saveButton}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  content: { padding: space[4], paddingBottom: space[8] },
  intro: { marginTop: space[2] },
  snapCard: {
    marginTop: space[4],
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    padding: space[3],
  },
  snapBody: { marginTop: 4 },
  snapButton: { alignSelf: "flex-start", paddingHorizontal: 0, minHeight: 0, marginTop: 2 },
  fields: { marginTop: space[4], gap: space[3] },
  submitError: { marginTop: space[3] },
  saveButton: { marginTop: space[6] },
});
