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
import { useOpenShift } from "../../state/api/shifts";
import { HomeStackParamList } from "../../app/stacks/HomeStack";

function extractErrorMessage(err: unknown, fallback: string): string {
  const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
  return message ?? fallback;
}

/** Opening-float form — the explicit, user-initiated start-of-day shift open. */
export function OpenShiftScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<HomeStackParamList>>();
  const openShift = useOpenShift();

  const [openingFloat, setOpeningFloat] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleOpen = async () => {
    setErrorMessage(null);
    const floatAmount = parseRupiah(openingFloat);
    try {
      await openShift.mutateAsync({ openingFloat: floatAmount });
      navigation.navigate("Home");
    } catch (err) {
      setErrorMessage(extractErrorMessage(err, "Couldn't open the shift. Check your connection and try again."));
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text variant="h2">Open shift</Text>
      <Text variant="body" color={colors.neutral700} style={styles.intro}>
        Count the cash in the drawer before your first sale — this becomes the opening float for today's shift.
      </Text>

      <View style={styles.fields}>
        <TextField
          label="Opening float"
          value={openingFloat}
          onChangeText={(v) => {
            setOpeningFloat(v);
            setErrorMessage(null);
          }}
          placeholder="0"
          keyboardType="numeric"
        />
      </View>

      {errorMessage ? (
        <Text variant="caption" color={colors.accent700} style={styles.errorText}>
          {errorMessage}
        </Text>
      ) : null}

      <Button
        title={openShift.isPending ? "Opening…" : "Open shift"}
        onPress={handleOpen}
        disabled={openShift.isPending}
        loading={openShift.isPending}
        fullWidth
        style={styles.openButton}
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
  errorText: { marginTop: space[3] },
  openButton: { marginTop: space[6] },
});
