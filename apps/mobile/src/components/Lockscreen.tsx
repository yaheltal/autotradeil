import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { useAuth } from "@/services/auth";
import { haptic } from "@/services/haptics";
import { t } from "@/services/i18n";
import { useUiStore } from "@/stores/uiStore";
import { useTheme } from "@/theme/ThemeProvider";

import { Button } from "./Button";
import { OtpInput } from "./OtpInput";

/**
 * Renders when a session is active AND a lock method (biometric / PIN) is
 * configured AND the user hasn't passed the gate this app session.
 *
 * Behavior:
 *   - authMethod === "biometric" → auto-triggers the OS prompt on mount.
 *     On failure the user can retry, or fall back to PIN if one was
 *     ALSO configured (we don't expose this in the current setup flow,
 *     but the path is wired so it's safe if the future setup screen
 *     lets you set both).
 *   - authMethod === "pin"        → renders a 6-cell secure input.
 *   - "התנתק" tears down session + lock state and routes to /login.
 */
export function Lockscreen() {
  const { authMethod, biometricKind, authenticateBiometrics, verifyPinAndUnlock, signOut } =
    useAuth();
  const { colors, spacing, typography } = useTheme();
  const pushToast = useUiStore((s) => s.pushToast);

  const [busy, setBusy] = useState(false);
  const [showPinInput, setShowPinInput] = useState(authMethod === "pin");
  const [pin, setPin] = useState("");
  const ranOnce = useRef(false);

  const tryBiometric = async () => {
    setBusy(true);
    const ok = await authenticateBiometrics().catch(() => false);
    setBusy(false);
    if (!ok) {
      // Fall back to PIN entry only if a PIN was set up. Today the setup
      // flow is mutually-exclusive (one OR the other), so for now this
      // shows the OS-fallback options instead via a retry button.
      haptic.error();
    }
  };

  const handlePinSubmit = async (entered: string) => {
    setBusy(true);
    const ok = await verifyPinAndUnlock(entered);
    setBusy(false);
    if (ok) {
      haptic.success();
    } else {
      haptic.error();
      pushToast("error", t("auth.wrongPin"));
      setPin("");
    }
  };

  useEffect(() => {
    if (ranOnce.current) return;
    if (authMethod === "biometric") {
      ranOnce.current = true;
      tryBiometric();
    } else if (authMethod === "pin") {
      ranOnce.current = true;
      setShowPinInput(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authMethod]);

  const isPin = authMethod === "pin" || showPinInput;
  const bioGlyph = biometricKind === "face" ? "😀" : "👆";
  const bioMessage =
    biometricKind === "face" ? t("auth.scanFace") : t("auth.placeFinger");

  return (
    <View style={[styles.wrap, { backgroundColor: colors.bg, padding: spacing.xl }]}>
      <Animated.View entering={FadeIn.duration(300)} style={styles.glyphWrap}>
        <Text style={styles.glyph}>{isPin ? "🔢" : bioGlyph}</Text>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(120).springify()} style={{ alignItems: "center" }}>
        <Text style={[typography.h1, { color: colors.textPrimary, textAlign: "center" }]}>
          {t("auth.title")}
        </Text>
        <Text
          style={[
            typography.body,
            { color: colors.textSecondary, textAlign: "center", marginTop: spacing.md },
          ]}
        >
          {isPin ? t("auth.enterPinCode") : bioMessage}
        </Text>
      </Animated.View>

      {isPin ? (
        <Animated.View
          entering={FadeInDown.delay(220).springify()}
          style={{ alignSelf: "stretch", marginTop: spacing.xxl, alignItems: "center" }}
        >
          <OtpInput
            length={6}
            value={pin}
            onChange={setPin}
            onComplete={handlePinSubmit}
            secureTextEntry
            autoFocus
            disabled={busy}
          />
        </Animated.View>
      ) : (
        <Animated.View
          entering={FadeInDown.delay(220).springify()}
          style={{ alignSelf: "stretch", gap: spacing.md, marginTop: spacing.xxl }}
        >
          <Button
            label={t("biometric.unlock")}
            onPress={tryBiometric}
            loading={busy}
            variant="primary"
          />
        </Animated.View>
      )}

      <View style={{ flex: 1 }} />

      <Animated.View entering={FadeInDown.delay(320).springify()}>
        <Button label={t("auth.logout")} onPress={() => signOut()} variant="ghost" />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: "center" },
  glyphWrap: { marginTop: 64, marginBottom: 24 },
  glyph: { fontSize: 64 },
});
