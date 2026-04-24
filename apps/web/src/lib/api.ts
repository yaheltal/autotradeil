const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type ApiError = {
  code?: string;
  message: string;
  detail?: unknown;
};

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers: headerInit, ...rest } = options;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((headerInit as Record<string, string>) ?? {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers });

  if (!res.ok) {
    let body: { error?: ApiError; detail?: unknown; message?: string } = {};
    try {
      body = await res.json();
    } catch {
      /* fall through to default message */
    }
    const message =
      body.error?.message ??
      (typeof body.detail === "string" ? body.detail : undefined) ??
      body.message ??
      res.statusText ??
      "שגיאה בשרת";
    throw new Error(message);
  }

  return (await res.json()) as T;
}
