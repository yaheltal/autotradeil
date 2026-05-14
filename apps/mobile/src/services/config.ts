import Constants from "expo-constants";

type Extra = {
  apiBaseUrl?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  sentryDsn?: string;
};

const extra = (Constants.expoConfig?.extra ?? {}) as Extra;

export const API_BASE_URL =
  extra.apiBaseUrl?.replace(/\/$/, "") ?? "https://autotradeil.onrender.com";
export const SUPABASE_URL =
  extra.supabaseUrl ?? "https://epozdkikerrtwfmlpbzx.supabase.co";
export const SUPABASE_ANON_KEY = extra.supabaseAnonKey ?? "";
export const SENTRY_DSN = extra.sentryDsn ?? "";

export const OAUTH_REDIRECT_URL = "autotradeil://auth/callback";
