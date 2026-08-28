import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import axios from "axios";
import { LoginRequest, LoginResponse, PinLoginRequest } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { Divider } from "../../components/Divider";
import { apiClient } from "../../state/api/apiClient";
import { useAuthStore } from "../../state/auth/authStore";
import { colors, space } from "../../theme/tokens";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../app/RootNavigator";

/** Real email/password login against POST /api/auth/login. */
export function LoginScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"account" | "pin">("account");
  const [businessSlug, setBusinessSlug] = useState("");
  const [outletCode, setOutletCode] = useState("UTAMA");
  const [pin, setPin] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const login = useAuthStore((s) => s.login);

  const canSubmit = mode === "account"
    ? email.trim().length > 0 && password.length > 0 && !submitting
    : businessSlug.trim().length >= 3 && outletCode.trim().length >= 2 && pin.length >= 4 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const request = mode === "account"
        ? apiClient.post<LoginResponse>("/api/auth/login", { email: email.trim(), password } satisfies LoginRequest)
        : apiClient.post<LoginResponse>("/api/auth/pin-login", { businessSlug: businessSlug.trim().toLowerCase(), outletCode: outletCode.trim().toUpperCase(), pin } satisfies PinLoginRequest);
      const { data } = await request;
      login(data);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        if (err.response) {
          const message =
            (err.response.data as { message?: string } | undefined)?.message ??
            "Invalid email or password.";
          setError(message);
        } else {
          setError("Can't reach the server. Check your connection and try again.");
        }
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={[]}>
    <KeyboardAvoidingView
      style={styles.flex}
      behavior="padding"
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="kicker">KOTDEE POS</Text>
        <Text variant="h1" style={styles.title}>
          Masuk ke usaha Anda
        </Text>
        <Text variant="body" color={colors.neutral700} style={styles.subtitle}>
          {mode === "account" ? "Gunakan email dan password pemilik atau staf." : "Gunakan kode usaha, outlet, dan PIN yang diberikan pemilik."}
        </Text>

        <Divider />

        <View style={styles.modeRow}>
          <Button title="Email" variant={mode === "account" ? "primary" : "secondary"} onPress={() => { setMode("account"); setError(null); }} style={styles.modeButton} />
          <Button title="PIN kasir" variant={mode === "pin" ? "primary" : "secondary"} onPress={() => { setMode("pin"); setError(null); }} style={styles.modeButton} />
        </View>

        {mode === "account" ? <>
        <View style={styles.field}>
          <TextField
            label="Email"
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
          />
        </View>
        <View style={styles.field}>
          <TextField
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            textContentType="password"
            showPasswordToggle
          />
        </View>
        </> : <>
          <View style={styles.field}><TextField label="Kode usaha" value={businessSlug} onChangeText={setBusinessSlug} placeholder="contoh: warung-sari-a1b2c3" autoCapitalize="none" autoCorrect={false} /></View>
          <View style={styles.field}><TextField label="Kode outlet" value={outletCode} onChangeText={setOutletCode} placeholder="UTAMA" autoCapitalize="characters" autoCorrect={false} /></View>
          <View style={styles.field}><TextField label="PIN kasir" value={pin} onChangeText={(value) => setPin(value.replace(/\D/g, "").slice(0, 6))} placeholder="4–6 digit" keyboardType="number-pad" secureTextEntry /></View>
        </>}

        {error ? (
          <Text variant="caption" color={colors.accent700} style={styles.error}>
            {error}
          </Text>
        ) : null}

        <Button
          title={submitting ? "Memproses…" : mode === "pin" ? "Buka kasir" : "Masuk"}
          onPress={handleSubmit}
          disabled={!canSubmit}
          loading={submitting}
          fullWidth
          style={styles.submit}
        />
        <Button title="Daftarkan usaha baru" variant="ghost" onPress={() => navigation.navigate("Register")} fullWidth style={styles.registerButton} />
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: space[4],
    paddingVertical: space[8],
  },
  title: { marginTop: 4 },
  subtitle: { marginTop: space[2] },
  field: { marginTop: space[3] },
  modeRow: { flexDirection: "row", gap: space[2], marginTop: space[4] },
  modeButton: { flex: 1, minHeight: 40, paddingVertical: 8 },
  error: { marginTop: space[3] },
  submit: { marginTop: space[6] },
  registerButton: { marginTop: space[2] },
});
