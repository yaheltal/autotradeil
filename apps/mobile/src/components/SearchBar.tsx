import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

type Props = {
  value: string;
  onChange: (v: string) => void;
  /** Debounced version of `onChange` — fires after the user pauses typing.
   * Use this for the actual API call so each keystroke doesn't refetch. */
  onDebouncedChange?: (v: string) => void;
  placeholder?: string;
  debounceMs?: number;
};

/**
 * Search box with a clear-button and built-in debounce.
 *
 * The local `value` updates instantly (so the text input feels live), but
 * `onDebouncedChange` only fires `debounceMs` after the last keystroke —
 * that's the value the parent should pass to the query.
 */
export function SearchBar({
  value,
  onChange,
  onDebouncedChange,
  placeholder,
  debounceMs = 250,
}: Props) {
  const { colors, radii, spacing, typography } = useTheme();
  const [internal, setInternal] = useState(value);
  const lastFiredRef = useRef(value);

  useEffect(() => {
    setInternal(value);
  }, [value]);

  useEffect(() => {
    if (!onDebouncedChange) return;
    if (internal === lastFiredRef.current) return;
    const id = setTimeout(() => {
      lastFiredRef.current = internal;
      onDebouncedChange(internal);
    }, debounceMs);
    return () => clearTimeout(id);
  }, [internal, debounceMs, onDebouncedChange]);

  const handleChange = (v: string) => {
    setInternal(v);
    onChange(v);
  };

  return (
    <View
      style={[
        styles.wrap,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: radii.lg,
          paddingHorizontal: spacing.md,
        },
      ]}
    >
      <Text style={styles.glyph}>🔍</Text>
      <TextInput
        value={internal}
        onChangeText={handleChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[
          styles.input,
          { color: colors.textPrimary, ...typography.body },
        ]}
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
        clearButtonMode="while-editing"
      />
      {internal.length > 0 ? (
        <Pressable onPress={() => handleChange("")} hitSlop={12}>
          <Text style={[styles.clear, { color: colors.textMuted }]}>✕</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    height: 44,
    borderWidth: 1,
    gap: 8,
  },
  glyph: { fontSize: 14, opacity: 0.6 },
  input: { flex: 1, paddingVertical: 0 },
  clear: { fontSize: 16, paddingHorizontal: 4 },
});
