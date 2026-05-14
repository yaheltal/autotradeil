import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { FadeInDown, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useUiStore } from "@/stores/uiStore";
import { useTheme } from "@/theme/ThemeProvider";

/**
 * Stack of dismissible toasts. Animated in/out with reanimated layout
 * transitions; auto-dismissed by the store after 3.5s.
 */
export function ToastHost() {
  const toasts = useUiStore((s) => s.toasts);
  const insets = useSafeAreaInsets();
  const { colors, radii, shadows, spacing, typography } = useTheme();

  useEffect(() => {
    // no-op; subscription is handled by zustand selector above.
  }, [toasts]);

  return (
    <View pointerEvents="box-none" style={[styles.host, { top: insets.top + 12 }]}>
      {toasts.map((t) => {
        const bg =
          t.kind === "success" ? colors.successBg : t.kind === "error" ? colors.dangerBg : colors.surface;
        const fg =
          t.kind === "success" ? colors.success : t.kind === "error" ? colors.danger : colors.textPrimary;
        return (
          <Animated.View
            key={t.id}
            entering={FadeInDown.springify().damping(16)}
            exiting={FadeOutUp.duration(180)}
            style={[
              styles.toast,
              shadows.md,
              { backgroundColor: bg, borderRadius: radii.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
            ]}
          >
            <Text style={[typography.bodyBold, { color: fg }]}>{t.message}</Text>
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: 16,
    right: 16,
    gap: 8,
  },
  toast: { alignSelf: "stretch" },
});
