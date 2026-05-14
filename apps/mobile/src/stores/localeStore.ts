import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import { setI18nLocale, type AppLocale } from "@/services/i18n";

const STORAGE_KEY = "app.locale";

type LocaleState = {
  locale: AppLocale;
  /** False until we've read the persisted value at app start. Components
   * that need to wait for hydration can gate their initial render on it,
   * but most just react via Zustand's default behavior. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setLocale: (next: AppLocale) => Promise<void>;
};

/**
 * Source of truth for the active app language.
 *
 * Why a store (vs reading i18n directly): re-renders when the user picks
 * a different language, AND the parent layout uses `key={locale}` so the
 * entire tree remounts — that's how `t()` calls in already-mounted
 * components pick up the new strings without per-component refactor.
 */
export const useLocaleStore = create<LocaleState>((set) => ({
  locale: "he",
  hydrated: false,
  hydrate: async () => {
    try {
      const saved = (await AsyncStorage.getItem(STORAGE_KEY)) as AppLocale | null;
      const next: AppLocale = saved === "en" || saved === "he" ? saved : "he";
      setI18nLocale(next);
      set({ locale: next, hydrated: true });
    } catch {
      setI18nLocale("he");
      set({ locale: "he", hydrated: true });
    }
  },
  setLocale: async (next) => {
    await AsyncStorage.setItem(STORAGE_KEY, next);
    setI18nLocale(next);
    set({ locale: next });
  },
}));
