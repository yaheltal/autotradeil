import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";

import { Button } from "@/components/Button";
import { OtpInput } from "@/components/OtpInput";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/services/auth";
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from "@/services/auth/pin";
import { haptic } from "@/services/haptics";
import { t } from "@/services/i18n";
import { useUiStore } from "@/stores/uiStore";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Two-step PIN entry: enter once, confirm again. We render with the
 * PIN_MAX_LENGTH (6) of cells but accept any 4–6 digit value — the user
 * "submits" by tapping Save (rather than auto-advancing on length 6) so
 * a 4-digit PIN is also valid.
 */
export function SetupPinScreen() {
  const router = useRouter();
  const pushToast = useUiStore((s) => s.pushToast);
  const { colors, spacing, typography } = useTheme();
  const { setupPin } = useAuth();

  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSave = async () => {
    if (pin.length < PIN_MIN_LENGTH) {
      pushToast("error", t("auth.pinTooShort"));
      return;
    }
    if (pin !== confirm) {
      pushToast("error", t("auth.pinMismatch"));
      return;
    }
    setBusy(true);
    try {
      await setupPin(pin);
      haptic.success();
      router.replace("/(tabs)/dashboard");
    } catch {
      pushToast("error", t("errors.unknown"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={[styles.wrap, { padding: spacing.xl }]}>
        <Animated.View entering={FadeInUp.delay(60).springify()} style={styles.hero}>
          <Text style={styles.glyph}>🔢</Text>
          <Text
            style={[
              typography.h1,
              { color: colors.textPrimary, textAlign: "center", marginTop: spacing.md },
            ]}
          >
            {t("auth.setupPin")}
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(160).springify()}
          style={{ marginTop: spacing.xxl, gap: spacing.md, alignItems: "center" }}
        >
          <Text style={[typography.bodyBold, { color: colors.textSecondary }]}>
            {t("auth.enterPin")}
          </Text>
          <OtpInput
            length={PIN_MAX_LENGTH}
            value={pin}
            onChange={setPin}
            secureTextEntry
            autoFocus
            disabled={busy}
          />
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(240).springify()}
          style={{ marginTop: spacing.xl, gap: spacing.md, alignItems: "center" }}
        >
          <Text style={[typography.bodyBold, { color: colors.textSecondary }]}>
            {t("auth.confirmPin")}
          </Text>
          <OtpInput
            length={PIN_MAX_LENGTH}
            value={confirm}
            onChange={setConfirm}
            secureTextEntry
            disabled={busy}
          />
        </Animated.View>

        <View style={{ flex: 1 }} />

        <Animated.View entering={FadeInDown.delay(320).springify()}>
          <Button
            label={t("auth.save")}
            onPress={handleSave}
            loading={busy}
            variant="primary"
          />
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  hero: { alignItems: "center", marginTop: 32 },
  glyph: { fontSize: 56 },
});
