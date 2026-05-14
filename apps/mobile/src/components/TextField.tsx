import { forwardRef } from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

type Props = TextInputProps & {
  label?: string;
  error?: string;
};

/** Themed input with label + error slot. Uses the brand spacing scale. */
export const TextField = forwardRef<TextInput, Props>(function TextField(
  { label, error, style, ...rest },
  ref
) {
  const { colors, radii, spacing, typography } = useTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      {label ? (
        <Text style={[typography.caption, { color: colors.textSecondary }]}>{label}</Text>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textMuted}
        {...rest}
        style={[
          styles.input,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.danger : colors.border,
            borderRadius: radii.lg,
            color: colors.textPrimary,
            paddingHorizontal: spacing.lg,
            ...typography.body,
          },
          style,
        ]}
      />
      {error ? (
        <Text style={[typography.caption, { color: colors.danger }]}>{error}</Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  input: {
    height: 48,
    borderWidth: 1,
  },
});
