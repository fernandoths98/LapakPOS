import React, { useState } from "react";
import { Pressable, StyleSheet, TextInput, TextInputProps, View } from "react-native";
import { Eye, EyeOff } from "lucide-react-native";
import { Text } from "../theme/Text";
import { colors, fonts, radius, space } from "../theme/tokens";

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
  /** Renders an eye toggle to reveal/hide the value (use on password fields). */
  showPasswordToggle?: boolean;
}

/** Bordered input matching styles.css's `.field` + `.input`. */
export function TextField({ label, error, style, onFocus, onBlur, secureTextEntry, showPasswordToggle, textContentType, autoComplete, ...rest }: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const isSecure = secureTextEntry && !revealed;

  return (
    <View>
      {label ? (
        <Text variant="kicker" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <View>
        <TextInput
          key={showPasswordToggle ? (isSecure ? "secure" : "revealed") : undefined}
          style={[
            styles.input,
            showPasswordToggle && styles.inputWithToggle,
            focused && styles.inputFocused,
            error ? styles.inputError : null,
            style,
          ]}
          placeholderTextColor={colors.neutral500}
          secureTextEntry={isSecure}
          textContentType={showPasswordToggle && revealed ? "none" : textContentType}
          autoComplete={showPasswordToggle && revealed ? "off" : autoComplete}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          {...rest}
        />
        {showPasswordToggle ? (
          <Pressable
            style={styles.eye}
            onPress={() => setRevealed((v) => !v)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={revealed ? "Sembunyikan password" : "Tampilkan password"}
          >
            {revealed ? (
              <EyeOff size={20} color={colors.neutral600} />
            ) : (
              <Eye size={20} color={colors.neutral600} />
            )}
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" color={colors.accent700} style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    marginBottom: 6,
    textTransform: "none",
    letterSpacing: 0,
    fontSize: 15,
    color: colors.neutral800,
  },
  input: {
    width: "100%",
    minHeight: 56,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    fontFamily: fonts.body,
    fontSize: 17,
    color: colors.text,
    backgroundColor: colors.neutral200,
    borderWidth: 1.5,
    borderColor: "transparent",
    borderRadius: radius.md,
  },
  inputWithToggle: {
    paddingRight: 44,
  },
  eye: {
    position: "absolute",
    right: 0,
    top: 0,
    height: 56,
    width: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  inputFocused: {
    borderColor: colors.accent,
    backgroundColor: colors.surface,
  },
  inputError: {
    borderColor: colors.accent700,
  },
  error: {
    marginTop: 4,
  },
});
