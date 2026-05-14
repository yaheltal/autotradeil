import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/theme/ThemeProvider";

import { Button } from "./Button";

type Props = {
  emoji?: string;
  title: string;
  body?: string;
  ctaLabel?: string;
  onCta?: () => void;
};

/**
 * Beautiful empty state — large emoji glyph, bold title, soft body, and
 * an optional primary CTA so the user always has a next step.
 */
export function EmptyState({ emoji = "✨", title, body, ctaLabel, onCta }: Props) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={[styles.wrap, { padding: spacing.xxxl }]}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[typography.h2, { color: colors.textPrimary, marginTop: spacing.lg, textAlign: "center" }]}>
        {title}
      </Text>
      {body ? (
        <Text
          style={[
            typography.body,
            { color: colors.textSecondary, marginTop: spacing.sm, textAlign: "center" },
          ]}
        >
          {body}
        </Text>
      ) : null}
      {ctaLabel && onCta ? (
        <Button label={ctaLabel} onPress={onCta} style={{ marginTop: spacing.xl, alignSelf: "stretch" }} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", flex: 1 },
  emoji: { fontSize: 56 },
});
