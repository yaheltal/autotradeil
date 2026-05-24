import { ActivityIndicator, StyleSheet, Text, ViewStyle } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

import { PressableScale } from "./PressableScale";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

type Props = {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  style?: ViewStyle;
};

/** Stripe-style buttons: 60-FPS spring press + haptic, full a11y, ZERO any. */
export function Button({
  label,
  onPress,
  variant = "primary",
  size = "lg",
  loading,
  disabled,
  leading,
  trailing,
  style,
}: Props) {
  const { colors, radii, spacing, typography } = useTheme();

  const variantStyle: ViewStyle =
    variant === "primary"
      ? { backgroundColor: colors.accent }
      : variant === "secondary"
      ? { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }
      : variant === "danger"
      ? { backgroundColor: colors.danger }
      : { backgroundColor: "transparent" };

  const labelColor =
    variant === "primary"
      ? colors.accentText
      : variant === "danger"
      ? "#FFFFFF"
      : colors.textPrimary;

  const heights: Record<Size, number> = { md: 44, lg: 52 };

  return (
    <PressableScale
      hapticStyle="press"
      onPress={loading || disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled, busy: !!loading }}
      style={[
        styles.base,
        {
          height: heights[size],
          borderRadius: radii.lg,
          paddingHorizontal: spacing.xl,
          opacity: disabled ? 0.5 : 1,
        },
        variantStyle,
        style,
      ]}
    >
      {leading}
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <Text style={[typography.bodyBold, { color: labelColor }]} numberOfLines={1}>
          {label}
        </Text>
      )}
      {trailing}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});
