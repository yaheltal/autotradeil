import axios, { AxiosError, AxiosRequestConfig } from "axios";
import axiosRetry from "axios-retry";

import { API_BASE_URL } from "./config";
import { captureError } from "./sentry";
import { supabase } from "./supabase";

/**
 * Authenticated API client.
 *
 * - Attaches Supabase access token on every request.
 * - On 401, attempts a single session refresh, then retries the request.
 * - axios-retry handles transient network/5xx with exponential backoff.
 * - All non-recoverable errors are reported to Sentry and re-thrown so
 *   TanStack Query can surface them through error boundaries.
 */
export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { Accept: "application/json" },
});

axiosRetry(api, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (err) => {
    const status = err.response?.status;
    return axiosRetry.isNetworkOrIdempotentRequestError(err) || status === 502 || status === 503;
  },
});

api.interceptors.request.use(async (cfg) => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) {
    cfg.headers = cfg.headers ?? {};
    (cfg.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  async (error: AxiosError) => {
    const original = error.config as (AxiosRequestConfig & { _retried?: boolean }) | undefined;
    if (error.response?.status === 401 && original && !original._retried) {
      original._retried = true;
      const { data, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !data.session) {
        return Promise.reject(error);
      }
      original.headers = original.headers ?? {};
      (original.headers as Record<string, string>).Authorization = `Bearer ${data.session.access_token}`;
      return api(original);
    }

    captureError(error, {
      url: original?.url,
      method: original?.method,
      status: error.response?.status,
    });
    return Promise.reject(error);
  }
);

export type ApiError = {
  status: number | null;
  message: string;
};

export function toApiError(err: unknown): ApiError {
  if (axios.isAxiosError(err)) {
    const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
    return { status: err.response?.status ?? null, message: detail ?? err.message };
  }
  if (err instanceof Error) return { status: null, message: err.message };
  return { status: null, message: "Unknown error" };
}
