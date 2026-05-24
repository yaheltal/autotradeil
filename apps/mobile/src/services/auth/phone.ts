/**
 * Phone+ID OTP login client.
 *
 * Talks to /api/v1/auth/otp/{request,verify} on our backend (FastAPI),
 * which is the single source of truth for the phone+ID factor pair.
 * Supabase only enters the picture inside the backend, where /verify
 * mints a real session via admin generate_link. From the mobile side
 * we just receive {access_token, refresh_token} and call
 * supabase.auth.setSession() to install them.
 *
 * Both endpoints rate-limited server-side; the client doesn't retry.
 */
import axios, { type AxiosError } from "axios";

import { API_BASE_URL } from "../config";

const ENDPOINT = `${API_BASE_URL}/api/v1/auth`;

export type RequestOtpInput = { phone: string; idNumber: string };
export type VerifyOtpInput = { phone: string; idNumber: string; code: string };

export type VerifyOtpResult = {
  access_token: string;
  refresh_token: string;
};

function unwrapAxiosError(err: unknown): never {
  const axiosErr = err as AxiosError<{ detail?: string; error?: { message?: string } }>;
  const data = axiosErr.response?.data;
  const detail =
    data?.detail ||
    data?.error?.message ||
    axiosErr.message ||
    "שגיאת רשת";
  const e = new Error(typeof detail === "string" ? detail : "שגיאה");
  (e as Error & { status?: number }).status = axiosErr.response?.status;
  throw e;
}

/**
 * Send a 6-digit OTP via SMS to the user's registered phone, after the
 * server confirms phone+ID match a single users row. Always 200; the
 * server intentionally returns the same generic message whether the
 * pair matched or not (no user enumeration).
 */
export async function requestPhoneOtp({ phone, idNumber }: RequestOtpInput): Promise<void> {
  try {
    await axios.post(
      `${ENDPOINT}/otp/request`,
      { phone, id_number: idNumber, delivery: "sms" },
      { timeout: 15_000 }
    );
  } catch (err) {
    unwrapAxiosError(err);
  }
}

/**
 * Verify the 6-digit code. On success the server returns Supabase tokens
 * which the caller installs into the local Supabase client. Throws on
 * 401 (wrong code / expired / id mismatch) — the message is already in
 * Hebrew from the API.
 */
export async function verifyPhoneOtp({
  phone,
  idNumber,
  code,
}: VerifyOtpInput): Promise<VerifyOtpResult> {
  try {
    const { data } = await axios.post<VerifyOtpResult>(
      `${ENDPOINT}/otp/verify`,
      { phone, id_number: idNumber, code },
      { timeout: 15_000 }
    );
    if (!data?.access_token || !data?.refresh_token) {
      throw new Error("שירות האימות לא החזיר session");
    }
    return data;
  } catch (err) {
    if (err instanceof Error && (err as Error & { status?: number }).status === undefined) {
      throw err;
    }
    unwrapAxiosError(err);
  }
}
