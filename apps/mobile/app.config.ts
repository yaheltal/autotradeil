import type { ExpoConfig } from "expo/config";

/**
 * Expo reads this at every CLI invocation, so process.env values from
 * `.env` (loaded automatically by `expo-cli` for keys with the
 * `EXPO_PUBLIC_` prefix) flow into the bundle.
 */
const config: ExpoConfig = {
  name: "AutoTradeIL",
  slug: "autotradeil",
  scheme: "autotradeil",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    image: "./assets/splash.png",
    resizeMode: "contain",
    backgroundColor: "#0B1F33",
  },
  ios: {
    supportsTablet: true,
    bundleIdentifier: "com.autotradeil",
    associatedDomains: ["applinks:autotradeil.com"],
    infoPlist: {
      NSCameraUsageDescription: "צילום רכב לרישום במלאי",
      NSPhotoLibraryUsageDescription: "בחירת תמונות רכב מהגלריה",
      NSFaceIDUsageDescription: "כניסה מהירה ומאובטחת באמצעות Face ID",
    },
  },
  android: {
    package: "com.autotradeil",
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#0B1F33",
    },
    intentFilters: [
      {
        action: "VIEW",
        data: [{ scheme: "https", host: "autotradeil.com" }],
        category: ["BROWSABLE", "DEFAULT"],
        autoVerify: true,
      },
    ],
  },
  web: {
    bundler: "metro",
    favicon: "./assets/favicon.png",
  },
  plugins: ["expo-router", "expo-secure-store", "expo-localization", "expo-local-authentication"],
  extra: {
    apiBaseUrl: process.env.EXPO_PUBLIC_API_URL ?? "https://autotradeil.onrender.com",
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? "https://epozdkikerrtwfmlpbzx.supabase.co",
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "",
    sentryDsn: process.env.EXPO_PUBLIC_SENTRY_DSN ?? "",
  },
  experiments: { typedRoutes: true },
};

export default config;
