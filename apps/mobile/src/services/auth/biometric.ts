import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

/**
 * Lockscreen unlock methods + biometric capability detection.
 *
 * Two storage keys drive the gate:
 *   - `auth_method` ∈ {"biometric", "pin"} | null  → which UX to render on the
 *     lockscreen. null means the user hasn't completed first-time setup yet.
 *   - `biometric_choice_made` ∈ "true" | absent    → the user has answered the
 *     "set up unlock?" prompt at least once (could've picked Skip).
 *
 * The legacy `biometric_enabled` key is preserved for backward compat with
 * older app versions that may still be in flight; new reads come from
 * `auth_method` exclusively.
 */
const AUTH_METHOD_KEY = "auth_method";
const CHOICE_KEY = "biometric_choice_made";
// Legacy — kept for upgrade compat. New code shouldn't read it.
const LEGACY_ENABLED_KEY = "biometric_enabled";

export type AuthMethod = "biometric" | "pin";
export type BiometricKind = "face" | "touch";

/** Hardware capable AND user has enrolled at least one factor. */
export async function isBiometricSupported(): Promise<boolean> {
  const compatible = await LocalAuthentication.hasHardwareAsync();
  const enrolled = await LocalAuthentication.isEnrolledAsync();
  return compatible && enrolled;
}

/** Which kind of biometric the device exposes (face wins over touch). */
export async function detectBiometricKind(): Promise<BiometricKind | null> {
  if (!(await isBiometricSupported())) return null;
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
    return "face";
  }
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
    return "touch";
  }
  return null;
}

/** Run the OS biometric prompt. Resolves to `true` on success. */
export async function authenticateWithBiometric(
  promptMessage = "אמת זהות לפתיחת האפליקציה"
): Promise<boolean> {
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    fallbackLabel: "השתמש ב-PIN",
    disableDeviceFallback: false,
  });
  return result.success;
}

/** Persist the chosen unlock method. Marks the choice as made. */
export async function setAuthMethod(method: AuthMethod): Promise<void> {
  await SecureStore.setItemAsync(AUTH_METHOD_KEY, method);
  await SecureStore.setItemAsync(CHOICE_KEY, "true");
  // Mirror to legacy key so older builds still see "enabled".
  await SecureStore.setItemAsync(LEGACY_ENABLED_KEY, "true");
}

/** Read the persisted method. null = setup not done. */
export async function getAuthMethod(): Promise<AuthMethod | null> {
  const v = await SecureStore.getItemAsync(AUTH_METHOD_KEY);
  if (v === "biometric" || v === "pin") return v;
  return null;
}

/** "Not now": user wants to skip lock setup but acknowledged the prompt. */
export async function skipLockSetup(): Promise<void> {
  await SecureStore.setItemAsync(CHOICE_KEY, "true");
  await SecureStore.deleteItemAsync(AUTH_METHOD_KEY);
  await SecureStore.deleteItemAsync(LEGACY_ENABLED_KEY);
}

/** True once the user has answered the setup prompt at least once. */
export async function hasMadeLockChoice(): Promise<boolean> {
  return (await SecureStore.getItemAsync(CHOICE_KEY)) === "true";
}

/**
 * Tear down everything lockscreen-related — call on Sign-out so a stolen
 * device can't replay biometric/PIN unlock against the next user.
 */
export async function clearLockSetup(): Promise<void> {
  await SecureStore.deleteItemAsync(AUTH_METHOD_KEY);
  await SecureStore.deleteItemAsync(CHOICE_KEY);
  await SecureStore.deleteItemAsync(LEGACY_ENABLED_KEY);
}
