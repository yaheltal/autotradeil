import { StyleSheet, Text, View } from "react-native";

import { t } from "@/services/i18n";
import { useTheme } from "@/theme/ThemeProvider";

import { Button } from "./Button";

type Props = {
  title?: string;
  message?: string;
  onRetry?: () => void;
};

export function ErrorState({ title, message, onRetry }: Props) {
  const { colors, spacing, typography } = useTheme();
  return (
    <View style={[styles.wrap, { padding: spacing.xxxl }]}>
      <Text style={styles.emoji}>⚠️</Text>
      <Text style={[typography.h2, { color: colors.textPrimary, marginTop: spacing.lg, textAlign: "center" }]}>
        {title ?? t("errors.unknown")}
      </Text>
      {message ? (
        <Text style={[typography.body, { color: colors.textSecondary, marginTop: spacing.sm, textAlign: "center" }]}>
          {message}
        </Text>
      ) : null}
      {onRetry ? (
        <Button
          label={t("common.retry")}
          onPress={onRetry}
          variant="secondary"
          style={{ marginTop: spacing.xl, alignSelf: "stretch" }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", flex: 1 },
  emoji: { fontSize: 48 },
});
