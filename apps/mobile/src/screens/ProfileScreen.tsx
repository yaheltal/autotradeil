import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";

import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ErrorState } from "@/components/ErrorState";
import { PressableScale } from "@/components/PressableScale";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { toApiError } from "@/services/api";
import { useAuth } from "@/services/auth";
import { t } from "@/services/i18n";
import { useMe } from "@/services/queries";
import { useLocaleStore } from "@/stores/localeStore";
import { useUiStore } from "@/stores/uiStore";
import { useTheme } from "@/theme/ThemeProvider";

export function ProfileScreen() {
  const {
    signOut,
    biometricAvailable,
    authMethod,
    setupBiometric,
    skipLockSetup,
    authenticateBiometrics,
  } = useAuth();
  const biometricEnabled = authMethod === "biometric";
  const me = useMe();
  const pushToast = useUiStore((s) => s.pushToast);
  const { colors, radii, spacing, typography } = useTheme();
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);

  const onToggle = async (next: boolean) => {
    try {
      if (next) {
        const ok = await authenticateBiometrics();
        if (!ok) return;
        await setupBiometric();
      } else {
        // Tearing down biometric also clears any PIN — the user is opting
        // out of the lockscreen entirely. They can re-enroll from /setup-*.
        await skipLockSetup();
      }
    } catch {
      pushToast("error", t("errors.unknown"));
    }
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ paddingTop: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg }}>
        <Text style={[typography.h1, { color: colors.textPrimary }]}>הגדרות</Text>

        <Card>
          {me.isLoading ? (
            <View style={{ gap: 8 }}>
              <Skeleton width="60%" height={18} />
              <Skeleton width="40%" height={14} />
            </View>
          ) : me.isError ? (
            <ErrorState message={toApiError(me.error).message} onRetry={() => me.refetch()} />
          ) : (
            <View style={{ gap: 4 }}>
              <Text style={[typography.h3, { color: colors.textPrimary }]} numberOfLines={1}>
                {me.data?.email ?? "—"}
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {me.data?.user_type ?? ""}
                {me.data?.verified ? " · ✓ מאומת" : ""}
              </Text>
            </View>
          )}
        </Card>

        <Card>
          <View style={styles.row}>
            <Text style={styles.rowGlyph}>🔒</Text>
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>
                Face ID / Touch ID
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
                {!biometricAvailable
                  ? "המכשיר שלך לא תומך באימות ביומטרי"
                  : biometricEnabled
                    ? "פעיל — נשתמש באימות ביומטרי בכל פתיחה"
                    : "הפעל לכניסה מהירה ומאובטחת"}
              </Text>
            </View>
            <Switch
              value={biometricEnabled}
              disabled={!biometricAvailable}
              onValueChange={onToggle}
              trackColor={{ true: colors.accent, false: colors.border }}
            />
          </View>
        </Card>

        <Card>
          <View style={styles.row}>
            <Text style={styles.rowGlyph}>🌐</Text>
            <View style={{ flex: 1 }}>
              <Text style={[typography.bodyBold, { color: colors.textPrimary }]}>
                {locale === "he" ? "שפה" : "Language"}
              </Text>
              <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>
                {locale === "he"
                  ? "כל מסכי האפליקציה יוצגו בשפה שתבחר"
                  : "All app screens will display in the selected language"}
              </Text>
            </View>
            <View
              style={{
                flexDirection: "row",
                borderRadius: radii.pill,
                borderColor: colors.border,
                borderWidth: 1,
                overflow: "hidden",
              }}
            >
              {(["he", "en"] as const).map((opt) => {
                const active = locale === opt;
                return (
                  <PressableScale
                    key={opt}
                    hapticStyle="selection"
                    onPress={() => setLocale(opt)}
                    style={{
                      backgroundColor: active ? colors.textPrimary : colors.bgElevated,
                      paddingHorizontal: 14,
                      paddingVertical: 6,
                    }}
                  >
                    <Text
                      style={[
                        typography.caption,
                        {
                          color: active ? colors.bg : colors.textPrimary,
                          fontWeight: "700",
                        },
                      ]}
                    >
                      {opt === "he" ? "עברית" : "English"}
                    </Text>
                  </PressableScale>
                );
              })}
            </View>
          </View>
        </Card>

        <Button label={t("common.logout")} variant="secondary" onPress={() => signOut()} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 16 },
  rowGlyph: { fontSize: 22 },
});
