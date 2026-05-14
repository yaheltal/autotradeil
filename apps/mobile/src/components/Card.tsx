import { StyleSheet, View, ViewStyle } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

type Props = {
  children: React.ReactNode;
  padding?: number;
  elevated?: boolean;
  style?: ViewStyle;
};

export function Card({ children, padding, elevated = true, style }: Props) {
  const { colors, radii, shadows, spacing } = useTheme();
  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: colors.bgElevated,
          borderRadius: radii.xl,
          padding: padding ?? spacing.lg,
          borderWidth: elevated ? 0 : 1,
          borderColor: colors.border,
        },
        elevated ? shadows.sm : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {},
});
