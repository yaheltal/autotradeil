/**
 * Persistent session storage for the mobile app.
 *
 * Why a separate module: Supabase keeps the session in AsyncStorage by
 * default, but we ALSO mirror the bare access+refresh tokens into
 * SecureStore (Keychain on iOS, Keystore on Android) so the lockscreen
 * gate can verify "we have a stored session" without unlocking it via
 * `supabase.auth.getSession()` (which decrypts AsyncStorage).
 *
 * Convention:
 *   - Save on successful OTP verify.
 *   - Clear on signOut.
 *   - Read by the AuthGate at cold start to decide whether to show the
 *     lockscreen (token present + auth method set) or the login screen.
 */
import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "autotradeil_session";

export type StoredSession = {
  access_token: string;
  refresh_token: string;
};

export async function saveSecureSession(session: StoredSession): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
}

export async function getSecureSession(): Promise<StoredSession | null> {
  const raw = await SecureStore.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (parsed?.access_token && parsed?.refresh_token) return parsed;
  } catch {
    // corrupt — wipe and treat as logged-out
    await SecureStore.deleteItemAsync(SESSION_KEY);
  }
  return null;
}

export async function clearSecureSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

export async function hasStoredSession(): Promise<boolean> {
  return (await getSecureSession()) !== null;
}
