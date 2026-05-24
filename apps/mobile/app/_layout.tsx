import "react-native-url-polyfill/auto";
import { ActionSheetProvider } from "@expo/react-native-action-sheet";
import { BottomSheetModalProvider } from "@gorhom/bottom-sheet";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Lockscreen } from "@/components/Lockscreen";
import { ToastHost } from "@/components/Toast";
import { AuthProvider, useAuth } from "@/services/auth";
import { queryClient } from "@/services/queryClient";
import { initSentry } from "@/services/sentry";
import { useLocaleStore } from "@/stores/localeStore";
import { ThemeProvider } from "@/theme/ThemeProvider";

initSentry();

export default function RootLayout() {
  // Hydrate the persisted language preference at app boot. Synchronous
  // selector → no waterfall; the store starts in `he` and updates to
  // whatever was saved (or stays `he` if nothing was). The `key={locale}`
  // boundary below remounts the tree on language change, so already-mounted
  // components pick up new strings without a manual refresh.
  const locale = useLocaleStore((s) => s.locale);
  const hydrate = useLocaleStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }} key={locale}>
      <SafeAreaProvider>
        <ThemeProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <ActionSheetProvider>
                <BottomSheetModalProvider>
                  <ErrorBoundary>
                    <AuthGate>
                      <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
                        <Stack.Screen name="index" />
                        <Stack.Screen name="login" />
                        <Stack.Screen
                          name="verify-otp"
                          options={{ animation: "slide_from_right" }}
                        />
                        <Stack.Screen
                          name="setup-biometric"
                          options={{ animation: "slide_from_right" }}
                        />
                        <Stack.Screen
                          name="setup-pin"
                          options={{ animation: "slide_from_right" }}
                        />
                        <Stack.Screen name="(tabs)" />
                        <Stack.Screen
                          name="add-vehicle"
                          options={{ presentation: "modal", animation: "slide_from_bottom" }}
                        />
                      </Stack>
                    </AuthGate>
                    <ToastHost />
                    {/* White-everywhere theme → status bar icons must be
                        dark to stay legible. */}
                    <StatusBar style="dark" />
                  </ErrorBoundary>
                </BottomSheetModalProvider>
              </ActionSheetProvider>
            </AuthProvider>
          </QueryClientProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

// Routes that don't require an active session.
const PUBLIC_ROUTES = new Set(["login", "verify-otp"]);
// Routes that require a session but render OUTSIDE the lockscreen gate
// (the user is mid-setup and there's no lock yet).
const SESSION_ONLY_ROUTES = new Set(["setup-biometric", "setup-pin"]);

/**
 * AuthGate — redirects based on the auth state machine in AuthProvider:
 *   - No session                                  → /login
 *   - Session, no authMethod, on tabs             → stays on tabs
 *   - Session, no authMethod, on login            → bounce to /(tabs)/dashboard
 *   - Session + authMethod + !unlocked            → render <Lockscreen />
 *   - Session + authMethod + unlocked + on public → bounce to /(tabs)/dashboard
 */
function AuthGate({ children }: { children: React.ReactNode }) {
  const { session, ready, authMethod, unlocked } = useAuth();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!ready) return;
    const top = segments[0] ?? "";
    const inTabs = top === "(tabs)";
    const onPublic = PUBLIC_ROUTES.has(top);
    const inSetup = SESSION_ONLY_ROUTES.has(top);

    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log("[AuthGate]", {
        ready,
        hasSession: !!session,
        authMethod,
        unlocked,
        top,
      });
    }

    if (!session) {
      if (inTabs || inSetup) router.replace("/login");
      return;
    }

    // Session present.
    if (authMethod && !unlocked) return; // <Lockscreen /> rendered below
    if (onPublic || top === "") {
      router.replace("/(tabs)/dashboard");
    }
  }, [ready, session, segments, router, authMethod, unlocked]);

  // Lock branch is the highest-priority gate.
  if (ready && session && authMethod && !unlocked) return <Lockscreen />;
  return <>{children}</>;
}
