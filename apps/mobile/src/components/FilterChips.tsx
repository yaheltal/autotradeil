import { ScrollView, StyleSheet, Text, View } from "react-native";

import { haptic } from "@/services/haptics";
import { useTheme } from "@/theme/ThemeProvider";

import { PressableScale } from "./PressableScale";

export type ChipOption<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

type Props<T extends string> = {
  options: readonly ChipOption<T>[];
  value: T;
  onChange: (v: T) => void;
};

/**
 * Horizontal segmented control. One chip is always "selected" (no null
 * state) — pass an "all" option as the default. Scrollable when the row
 * overflows so we don't have to enforce a max chip count.
 */
export function FilterChips<T extends string>({ options, value, onChange }: Props<T>) {
  const { colors, radii, spacing, typography } = useTheme();

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: spacing.sm, paddingHorizontal: spacing.xl }}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <PressableScale
            key={opt.value}
            hapticStyle="selection"
            onPress={() => {
              if (!active) {
                haptic.selection();
                onChange(opt.value);
              }
            }}
            style={{
              ...styles.chip,
              backgroundColor: active ? colors.textPrimary : colors.surface,
              borderColor: active ? colors.textPrimary : colors.border,
              borderRadius: radii.pill,
              paddingHorizontal: spacing.md,
            }}
          >
            <Text
              style={[
                typography.caption,
                {
                  color: active ? colors.bg : colors.textPrimary,
                  fontWeight: "600",
                },
              ]}
            >
              {opt.label}
              {opt.count !== undefined ? ` · ${opt.count}` : ""}
            </Text>
          </PressableScale>
        );
      })}
      {/* Right-side gutter so the last chip isn't flush against the edge in RTL. */}
      <View style={{ width: spacing.lg }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
});
