/**
 * HTTP client for the Qitlo backend.
 *
 * Wraps `fetch` with:
 *   - The configured base URL (EXPO_PUBLIC_API_URL or the placeholder default)
 *   - Automatic Authorization: Bearer header injection when a token is set
 *   - JSON request/response handling
 *   - A typed error envelope matching the webapp's `{ error: { message, field? } }`
 *
 * Why this module exists separately from auth/sync: the auth and sync layers
 * should only know what calls to make, not how to make them. Swapping
 * transports (e.g., adding retry, OTEL spans, or migrating to a different
 * backend) happens here.
 */

/* Base URL. EXPO_PUBLIC_API_URL is inlined at build time and overrides this
 * default. The default points at the current Vercel deployment for the
 * webapp. For simulator dev, set EXPO_PUBLIC_API_URL=http://localhost:3000
 * in a .env file (and add NSAllowsArbitraryLoads to app.json so iOS ATS
 * allows the plain-HTTP localhost connection).
 *
 * NOTE: the URL below carries a per-deployment hash (-hnb4o3iwu-). Vercel
 * also serves a stable URL at https://<project>.vercel.app or a custom
 * domain; prefer that for the mobile app once it's confirmed, since the
 * hashed URL will rotate every time the webapp is redeployed. */
const DEFAULT_API_URL =
  "https://qitlo-project-hnb4o3iwu-femilord-7506s-projects.vercel.app";
const API_URL =
  (typeof process !== "undefined" && process.env?.EXPO_PUBLIC_API_URL) ||
  DEFAULT_API_URL;

let cachedToken: string | null = null;

/** Set the in-memory Bearer token. Auth layer also persists it to
 *  expo-secure-store. We cache it here so every request doesn't have to hit
 *  the Keychain. */
export function setApiToken(token: string | null): void {
  cachedToken = token;
}

export function getApiToken(): string | null {
  return cachedToken;
}

export type ApiError = {
  field?: string;
  message: string;
};

export class ApiRequestError extends Error {
  status: number;
  body: { error?: ApiError } | null;
  constructor(status: number, body: { error?: ApiError } | null) {
    super(body?.error?.message ?? `Request failed with status ${status}`);
    this.name = "ApiRequestError";
    this.status = status;
    this.body = body;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Send the Authorization header. Defaults to true; signup/login pass false. */
  auth?: boolean;
};

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, auth = true } = opts;

  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (auth && cachedToken) headers["Authorization"] = `Bearer ${cachedToken}`;

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiRequestError(0, {
      error: { message: err instanceof Error ? err.message : "Network error." },
    });
  }

  const text = await res.text();
  let parsed: unknown = null;
  if (text) {
    try {
      parsed = JSON.parse(text);
    } catch {
      // Non-JSON response. Leave parsed = null; ApiRequestError will surface
      // a generic message rather than crashing the parser.
    }
  }

  if (!res.ok) {
    throw new ApiRequestError(res.status, parsed as { error?: ApiError } | null);
  }
  return parsed as T;
}

/* ------------------------------------------------------------------ */
/* Typed surface — what the rest of the app calls                      */
/* ------------------------------------------------------------------ */

export type SignupRequest = {
  email: string;
  authHash: string;
  encryptSalt: string;
};

export type SignupResponse = {
  userId: string;
  email: string;
  encryptSalt: string;
  token: string;
};

export type LoginRequest = {
  email: string;
  authHash: string;
};

export type LoginResponse = SignupResponse;

export type MeResponse = {
  userId: string;
  email: string;
  encryptSalt: string;
};

export type SyncGetResponse = {
  blob: {
    ciphertext: string;
    iv: string;
    version: number;
    lastModified: string;
  } | null;
};

export type SyncPutRequest = {
  ciphertext: string;
  iv: string;
  expectedVersion: number;
};

export type SyncPutResponse = {
  version: number;
  lastModified: string;
};

export type SyncConflictResponse = {
  error: { message: string };
  current: {
    ciphertext: string;
    iv: string;
    version: number;
    lastModified: string;
  } | null;
};

export const api = {
  signup: (body: SignupRequest) =>
    request<SignupResponse>("/api/auth/signup", { method: "POST", body, auth: false }),
  login: (body: LoginRequest) =>
    request<LoginResponse>("/api/auth/login", { method: "POST", body, auth: false }),
  logout: () =>
    request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
  me: () => request<MeResponse>("/api/auth/me"),
  syncGet: () => request<SyncGetResponse>("/api/sync"),
  syncPut: (body: SyncPutRequest) =>
    request<SyncPutResponse>("/api/sync", { method: "PUT", body }),
};
