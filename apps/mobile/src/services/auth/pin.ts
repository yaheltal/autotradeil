/**
 * PIN-based app unlock (alternative to biometric).
 *
 * Storage: PIN is kept in SecureStore (Keychain / Keystore — OS-encrypted
 * at rest). For an MVP we store the PIN as-is; a future hardening step is
 * to replace this with a salted PBKDF2 hash so a memory dump can't lift
 * the PIN even with platform sandbox bypass.
 *
 * Length: 4–6 digits, numeric only.
 */
import * as SecureStore from "expo-secure-store";

const PIN_KEY = "user_pin";

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

export function isValidPin(pin: string): boolean {
  return /^\d+$/.test(pin) && pin.length >= PIN_MIN_LENGTH && pin.length <= PIN_MAX_LENGTH;
}

export async function setPin(pin: string): Promise<void> {
  if (!isValidPin(pin)) throw new Error("Invalid PIN length");
  await SecureStore.setItemAsync(PIN_KEY, pin);
}

export async function verifyPin(pin: string): Promise<boolean> {
  const saved = await SecureStore.getItemAsync(PIN_KEY);
  return !!saved && saved === pin;
}

export async function hasPin(): Promise<boolean> {
  return (await SecureStore.getItemAsync(PIN_KEY)) !== null;
}

export async function clearPin(): Promise<void> {
  await SecureStore.deleteItemAsync(PIN_KEY);
}
