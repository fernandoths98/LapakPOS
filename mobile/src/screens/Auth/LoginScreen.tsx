import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import axios from "axios";
import { LoginRequest, LoginResponse } from "@lapak/shared";
import { Text } from "../../theme/Text";
import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { Divider } from "../../components/Divider";
import { apiClient } from "../../state/api/apiClient";
import { useAuthStore } from "../../state/auth/authStore";
import { colors, space } from "../../theme/tokens";

/** Real email/password login against POST /api/auth/login. */
export function LoginScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const login = useAuthStore((s) => s.login);

  const canSubmit = email.trim().length > 0 && password.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const body: LoginRequest = { email: email.trim(), password };
      const { data } = await apiClient.post<LoginResponse>("/api/auth/login", body);
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
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="kicker">Lapak</Text>
        <Text variant="h1" style={styles.title}>
          Welcome back
        </Text>
        <Text variant="body" color={colors.neutral700} style={styles.subtitle}>
          Sign in with the email and password your merchant set up for you.
        </Text>

        <Divider />

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
          />
        </View>

        {error ? (
          <Text variant="caption" color={colors.accent700} style={styles.error}>
            {error}
          </Text>
        ) : null}

        <Button
          title={submitting ? "Signing in…" : "Sign in"}
          onPress={handleSubmit}
          disabled={!canSubmit}
          loading={submitting}
          fullWidth
          style={styles.submit}
        />
      </ScrollView>
    </KeyboardAvoidingView>
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
  error: { marginTop: space[3] },
  submit: { marginTop: space[6] },
});
