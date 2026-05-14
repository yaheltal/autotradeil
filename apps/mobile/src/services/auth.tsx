import type { Session } from "@supabase/supabase-js";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  type AuthMethod,
  type BiometricKind,
  authenticateWithBiometric,
  clearLockSetup,
  detectBiometricKind,
  getAuthMethod,
  isBiometricSupported,
  setAuthMethod,
  skipLockSetup as persistSkipLockSetup,
} from "./auth/biometric";
import {
  clearPin,
  hasPin as pinIsSet,
  setPin as persistPin,
  verifyPin as checkPin,
} from "./auth/pin";
import { requestPhoneOtp as apiRequestOtp, verifyPhoneOtp as apiVerifyOtp } from "./auth/phone";
import { clearSecureSession, saveSecureSession } from "./auth/session";
import { captureError } from "./sentry";
import { supabase } from "./supabase";

/**
 * AuthProvider — phone+ID+SMS for first-time login, biometric/PIN for
 * subsequent app opens.
 *
 * State machine:
 *   - No Supabase session             → /login
 *   - Session + no authMethod         → app (user skipped or hasn't set up)
 *   - Session + authMethod + !unlocked → <Lockscreen />
 *   - Session + authMethod + unlocked  → app
 *
 * `unlocked` is per-process (resets on every cold start). `authMethod`
 * persists in SecureStore so the lockscreen knows which UI to render.
 */

type AuthContextValue = {
  session: Session | null;
  ready: boolean;

  // Login (phone+ID+SMS)
  requestPhoneOtp: (phone: string, idNumber: string) => Promise<void>;
  verifyPhoneOtp: (phone: string, idNumber: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;

  // Lockscreen capabilities
  authMethod: AuthMethod | null;
  biometricAvailable: boolean;
  biometricKind: BiometricKind | null;
  unlocked: boolean;

  // First-time setup
  setupBiometric: () => Promise<void>;
  setupPin: (pin: string) => Promise<void>;
  skipLockSetup: () => Promise<void>;

  // Lockscreen runtime
  authenticateBiometrics: () => Promise<boolean>;
  verifyPinAndUnlock: (pin: string) => Promise<boolean>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [authMethod, setMethod] = useState<AuthMethod | null>(null);
  const [biometricAvailable, setBioAvailable] = useState(false);
  const [biometricKind, setBioKind] = useState<BiometricKind | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data }, supported, kind, method] = await Promise.all([
        supabase.auth.getSession(),
        isBiometricSupported(),
        detectBiometricKind(),
        getAuthMethod(),
      ]);
      setSession(data.session);
      setBioAvailable(supported);
      setBioKind(kind);
      setMethod(method);
      // Cold start: if we have no session OR no lock method, skip the gate.
      // Otherwise the user must pass the lockscreen first.
      setUnlocked(!data.session || !method);
      setReady(true);
    })().catch((err) => {
      captureError(err);
      setReady(true);
    });

    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_IN") {
        // Fresh login through verifyPhoneOtp — already past the gate.
        setUnlocked(true);
      } else if (event === "SIGNED_OUT") {
        setUnlocked(false);
        setMethod(null);
        // Wipe stored secrets — a stolen device can't replay biometric
        // unlock against a different account.
        Promise.all([clearLockSetup(), clearPin(), clearSecureSession()]).catch(
          () => undefined
        );
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const requestPhoneOtp = useCallback(async (phone: string, idNumber: string) => {
    await apiRequestOtp({ phone, idNumber });
  }, []);

  const verifyPhoneOtp = useCallback(
    async (phone: string, idNumber: string, code: string) => {
      const tokens = await apiVerifyOtp({ phone, idNumber, code });
      // Install the Supabase session locally — onAuthStateChange will fire
      // SIGNED_IN which flips `unlocked` and `session`.
      const { error } = await supabase.auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      if (error) throw error;
      // Mirror to SecureStore so a future cold start can detect "logged in"
      // without first decrypting the AsyncStorage-backed Supabase session.
      await saveSecureSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
    },
    []
  );

  const setupBiometric = useCallback(async () => {
    await setAuthMethod("biometric");
    setMethod("biometric");
  }, []);

  const setupPin = useCallback(async (pin: string) => {
    await persistPin(pin);
    await setAuthMethod("pin");
    setMethod("pin");
  }, []);

  const skipLockSetup = useCallback(async () => {
    await persistSkipLockSetup();
    setMethod(null);
  }, []);

  const authenticateBiometrics = useCallback(async () => {
    if (!biometricAvailable) return false;
    const ok = await authenticateWithBiometric("אמת זהות לפתיחת האפליקציה");
    if (ok) setUnlocked(true);
    return ok;
  }, [biometricAvailable]);

  const verifyPinAndUnlock = useCallback(async (pin: string) => {
    const ok = await checkPin(pin);
    if (ok) setUnlocked(true);
    return ok;
  }, []);

  const signOut = useCallback(async () => {
    // Clear lock state BEFORE supabase.signOut, otherwise the
    // SIGNED_OUT handler could race with the local clears below.
    await Promise.all([clearLockSetup(), clearPin(), clearSecureSession()]);
    await supabase.auth.signOut();
  }, []);

  // Defensive: if PIN method is set but the secure store somehow lost the
  // PIN value (user wiped Keychain via OS), demote to no-method so the
  // user lands at /login on next cold start instead of an unbreakable
  // lockscreen.
  useEffect(() => {
    if (authMethod !== "pin") return;
    pinIsSet().then((set) => {
      if (!set) {
        setMethod(null);
        persistSkipLockSetup().catch(() => undefined);
      }
    });
  }, [authMethod]);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      ready,
      requestPhoneOtp,
      verifyPhoneOtp,
      signOut,
      authMethod,
      biometricAvailable,
      biometricKind,
      unlocked,
      setupBiometric,
      setupPin,
      skipLockSetup,
      authenticateBiometrics,
      verifyPinAndUnlock,
    }),
    [
      session,
      ready,
      requestPhoneOtp,
      verifyPhoneOtp,
      signOut,
      authMethod,
      biometricAvailable,
      biometricKind,
      unlocked,
      setupBiometric,
      setupPin,
      skipLockSetup,
      authenticateBiometrics,
      verifyPinAndUnlock,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
