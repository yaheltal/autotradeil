import { StyleSheet, View, ViewStyle } from "react-native";
import { Edge, SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/theme/ThemeProvider";

type Props = {
  children: React.ReactNode;
  edges?: readonly Edge[];
  padded?: boolean;
  style?: ViewStyle;
};

/**
 * Themed safe-area screen container. Default top + horizontal insets;
 * pages with their own bottom-tab use the default (no bottom inset).
 */
export function Screen({ children, edges = ["top", "left", "right"], padded = true, style }: Props) {
  const { colors, spacing } = useTheme();
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.bg }]} edges={edges}>
      <View style={[styles.body, padded && { paddingHorizontal: spacing.xl }, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1 },
});
