import React, { useState } from "react";
import { StyleSheet, TextInput, TextInputProps, View } from "react-native";
import { Text } from "../theme/Text";
import { colors, fonts, radius, space } from "../theme/tokens";

export interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
}

/** Bordered input matching styles.css's `.field` + `.input`. */
export function TextField({ label, error, style, onFocus, onBlur, ...rest }: TextFieldProps) {
  const [focused, setFocused] = useState(false);

  return (
    <View>
      {label ? (
        <Text variant="kicker" style={styles.label}>
          {label}
        </Text>
      ) : null}
      <TextInput
        style={[
          styles.input,
          focused && styles.inputFocused,
          error ? styles.inputError : null,
          style,
        ]}
        placeholderTextColor={colors.neutral500}
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
    marginBottom: 5,
    textTransform: "none",
    letterSpacing: 0.4,
  },
  input: {
    width: "100%",
    minHeight: 46,
    paddingVertical: space[2],
    paddingHorizontal: space[2] + 3,
    fontFamily: fonts.body,
    fontSize: 15,
    color: colors.text,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: radius.md,
  },
  inputFocused: {
    borderColor: colors.accent,
  },
  inputError: {
    borderColor: colors.accent700,
  },
  error: {
    marginTop: 4,
  },
});
