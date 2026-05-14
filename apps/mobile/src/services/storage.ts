import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Single storage adapter consumed by Supabase. Wrapped to a thin object
 * so we can swap to MMKV later without touching call sites.
 */
export const storage = {
  getItem: (key: string) => AsyncStorage.getItem(key),
  setItem: (key: string, value: string) => AsyncStorage.setItem(key, value),
  removeItem: (key: string) => AsyncStorage.removeItem(key),
};
