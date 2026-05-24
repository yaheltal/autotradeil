import { StyleSheet, Text } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

import { PressableScale } from "./PressableScale";

type Props = {
  label?: string;
  glyph?: string;
  onPress: () => void;
  bottom?: number;
};

/** Floating action button — bottom-right, accent fill, spring-press. */
export function Fab({ glyph = "＋", label, onPress, bottom = 24 }: Props) {
  const { colors, radii, shadows, typography } = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      hapticStyle="press"
      style={[
        styles.fab,
        shadows.lg,
        {
          bottom,
          backgroundColor: colors.accent,
          borderRadius: radii.pill,
        },
      ]}
    >
      <Text style={[typography.h2, { color: colors.accentText }]}>{glyph}</Text>
      {label ? (
        <Text style={[typography.bodyBold, { color: colors.accentText, marginStart: 8 }]}>{label}</Text>
      ) : null}
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: "absolute",
    end: 20,
    height: 56,
    minWidth: 56,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
});
