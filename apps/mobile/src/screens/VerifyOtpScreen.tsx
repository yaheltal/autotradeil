import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeInUp } from "react-native-reanimated";

import { Button } from "@/components/Button";
import { OtpInput } from "@/components/OtpInput";
import { PressableScale } from "@/components/PressableScale";
import { Screen } from "@/components/Screen";
import { useAuth } from "@/services/auth";
import { getAuthMethod } from "@/services/auth/biometric";
import { haptic } from "@/services/haptics";
import { t } from "@/services/i18n";
import { useUiStore } from "@/stores/uiStore";
import { useTheme } from "@/theme/ThemeProvider";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

/**
 * /verify-otp — second step of phone+ID login.
 *
 * Reads `phone` + `idNumber` from route params (set by PhoneLoginScreen).
 * If they're missing the user came here directly somehow; bounce back
 * to /login.
 *
 * On verify success:
 *   1. Tokens come back from /otp/verify
 *   2. AuthProvider installs them via supabase.auth.setSession()
 *   3. We check if a lock method (biometric/PIN) is already configured.
 *      First-time → /setup-biometric. Returning user → /(tabs)/dashboard.
 */
function maskPhone(p: string): string {
  if (p.length < 4) return p;
  const last4 = p.slice(-4);
  return `${p.slice(0, 3)}-XXX-${last4}`;
}

export function VerifyOtpScreen() {
  const { verifyPhoneOtp, requestPhoneOtp } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ phone?: string; idNumber?: string }>();
  const pushToast = useUiStore((s) => s.pushToast);
  const { colors, spacing, typography } = useTheme();

  const phone = params.phone ?? "";
  const idNumber = params.idNumber ?? "";

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [countdown, setCountdown] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);

  // Defensive: missing params → user shouldn't be here.
  useEffect(() => {
    if (!phone || !idNumber) {
      router.replace("/login");
    }
  }, [phone, idNumber, router]);

  // Countdown for resend gate.
  useEffect(() => {
    if (countdown <= 0) return;
    const id = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [countdown]);

  const handleVerify = useCallback(
    async (entered: string) => {
      setBusy(true);
      try {
        await verifyPhoneOtp(phone, idNumber, entered);
        haptic.success();
        const method = await getAuthMethod();
        if (method) {
          router.replace("/(tabs)/dashboard");
        } else {
          // Cast: see PhoneLoginScreen note on typed-routes regeneration.
          router.replace("/setup-biometric" as never);
        }
      } catch (err) {
        haptic.error();
        const msg = err instanceof Error ? err.message : t("errors.unknown");
        pushToast("error", msg);
        setCode("");
      } finally {
        setBusy(false);
      }
    },
    [verifyPhoneOtp, phone, idNumber, router, pushToast]
  );

  const handleResend = useCallback(async () => {
    if (countdown > 0 || resending) return;
    setResending(true);
    try {
      await requestPhoneOtp(phone, idNumber);
      haptic.success();
      setCountdown(RESEND_SECONDS);
      pushToast("success", t("auth.codeResent"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("errors.unknown");
      pushToast("error", msg);
    } finally {
      setResending(false);
    }
  }, [countdown, resending, phone, idNumber, requestPhoneOtp, pushToast]);

  const canResend = countdown <= 0 && !resending;
  const resendLabel = canResend
    ? t("auth.resend")
    : `${t("auth.resend")} (0:${String(countdown).padStart(2, "0")})`;

  return (
    <Screen>
      <View style={[styles.wrap, { padding: spacing.xl }]}>
        <Animated.View entering={FadeInUp.delay(60).springify()} style={styles.hero}>
          <Text style={[typography.h1, { color: colors.textPrimary, textAlign: "center" }]}>
            {t("auth.enterCode")}
          </Text>
          <Text
            style={[
              typography.body,
              {
                color: colors.textSecondary,
                marginTop: spacing.md,
                textAlign: "center",
              },
            ]}
          >
            {t("auth.sentTo")} {maskPhone(phone)}
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(180).springify()}
          style={{ marginTop: spacing.xxl, alignItems: "center" }}
        >
          <OtpInput
            length={OTP_LENGTH}
            value={code}
            onChange={setCode}
            onComplete={handleVerify}
            autoFocus
            disabled={busy}
          />
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(280).springify()}
          style={{ alignItems: "center", marginTop: spacing.xxl, gap: spacing.md }}
        >
          <Text style={[typography.caption, { color: colors.textSecondary }]}>
            {t("auth.didntReceive")}
          </Text>
          <PressableScale
            onPress={handleResend}
            disabled={!canResend}
            hapticStyle="tap"
          >
            <Text
              style={[
                typography.bodyBold,
                { color: canResend ? colors.accent : colors.textMuted },
              ]}
            >
              {resendLabel}
            </Text>
          </PressableScale>
        </Animated.View>

        <View style={{ flex: 1 }} />

        <Animated.View entering={FadeInDown.delay(380).springify()}>
          <Button
            label={t("auth.changeNumber")}
            onPress={() => router.replace("/login")}
            variant="ghost"
          />
        </Animated.View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  hero: { alignItems: "center", marginTop: 32 },
});
