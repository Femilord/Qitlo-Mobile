/**
 * Mobile auth layer.
 *
 * Mirrors the contract of Qitlo-Project/src/lib/auth.ts so screen code is
 * platform-agnostic. The wire format and crypto are byte-for-byte
 * compatible with the webapp — see crypto.ts and the round-trip tests in
 * Qitlo-Shared/__tests__/cryptoRoundtrip.mjs.
 *
 * Differences from web:
 *   - The session token is a Bearer JWT stored in expo-secure-store (Keychain)
 *     rather than an httpOnly cookie.
 *   - The "encryption key" is a Uint8Array (raw AES-GCM key) rather than a
 *     Web Crypto CryptoKey opaque handle. Both apps produce identical
 *     SealedPayloads from the same password+salt.
 *   - No localStorage, no IndexedDB. The decrypted blob lives in React state
 *     and the AsyncStorage cache managed by sync.ts.
 */

import { deriveAuthPassword, deriveDataKey, randomSalt, type DataKey } from "./crypto";
import { api, ApiRequestError, setApiToken } from "./api";
import { clearStoredToken, readStoredToken, writeStoredToken } from "./tokenStore";

export type ThemeName = "aqua" | "dark";
export type GraphicMode = "bar" | "wheel" | "dots";

/** Client-side user shape after a successful auth flow. Identity bits come
 *  from the server; the rest is restored from the encrypted sync blob (or
 *  uses defaults on first signup). */
export type User = {
  id: string;
  email: string;
  encryptSalt: string;
};

export type AuthError = {
  field?: string;
  message: string;
};

/* ------------------------------------------------------------------ */
/* Password complexity                                                 */
/* ------------------------------------------------------------------ */

export const MIN_PASSWORD_LENGTH = 10;

const COMMON_PASSWORDS = new Set([
  "password", "password1", "password123", "qwerty", "qwerty123",
  "letmein", "welcome", "welcome1", "iloveyou", "admin",
  "administrator", "abc123", "monkey", "dragon", "12345678",
  "123456789", "1234567890", "111111", "000000",
]);

export function validatePassword(password: string): AuthError | null {
  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return { field: "password", message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password.length > 200) {
    return { field: "password", message: "Password is too long." };
  }
  const classes = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /[0-9]/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  if (classes < 3) {
    return { field: "password", message: "Use at least 3 of: lowercase, uppercase, digits, symbols." };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { field: "password", message: "That password is too common — pick something else." };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Encryption-key cache (in-memory only, cleared on logout)            */
/* ------------------------------------------------------------------ */

let cachedEncryptionKey: DataKey | null = null;

export function getEncryptionKey(): DataKey | null {
  return cachedEncryptionKey;
}

export function setEncryptionKey(key: DataKey | null): void {
  cachedEncryptionKey = key;
}

/* ------------------------------------------------------------------ */
/* Flows                                                                */
/* ------------------------------------------------------------------ */

function parseApiError(err: unknown, fallback: string): AuthError {
  if (err instanceof ApiRequestError && err.body?.error) {
    return {
      field: err.body.error.field,
      message: err.body.error.message ?? fallback,
    };
  }
  if (err instanceof Error) return { message: err.message };
  return { message: fallback };
}

/**
 * Sign up. Derives the auth password client-side, generates a fresh
 * encryptSalt, posts to /api/auth/signup, persists the returned token, and
 * caches the AES-GCM key locally.
 */
export async function signupUser({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<{ user?: User; error?: AuthError }> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
    return { error: { field: "email", message: "Enter a valid email address." } };
  }
  const complexityError = validatePassword(password);
  if (complexityError) return { error: complexityError };

  const authHash = await deriveAuthPassword(trimmedEmail, password);
  const encryptSalt = randomSalt();

  try {
    const res = await api.signup({ email: trimmedEmail, authHash, encryptSalt });
    setApiToken(res.token);
    await writeStoredToken(res.token);
    const key = await deriveDataKey(password, res.encryptSalt);
    setEncryptionKey(key);
    return {
      user: { id: res.userId, email: res.email, encryptSalt: res.encryptSalt },
    };
  } catch (err) {
    return { error: parseApiError(err, "Signup failed.") };
  }
}

/**
 * Log in. Derives the auth password client-side, posts to /api/auth/login,
 * persists the returned token, and caches the encryption key.
 */
export async function loginUser({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<{ user?: User; error?: AuthError }> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !password) {
    return { error: { message: "Enter both email and password." } };
  }

  const authHash = await deriveAuthPassword(trimmedEmail, password);
  try {
    const res = await api.login({ email: trimmedEmail, authHash });
    setApiToken(res.token);
    await writeStoredToken(res.token);
    const key = await deriveDataKey(password, res.encryptSalt);
    setEncryptionKey(key);
    return {
      user: { id: res.userId, email: res.email, encryptSalt: res.encryptSalt },
    };
  } catch (err) {
    return { error: parseApiError(err, "Login failed.") };
  }
}

/**
 * Restore an existing session at app boot. Reads the stored Bearer token,
 * calls /api/auth/me, returns the identity bits if valid. The encryption
 * key is NOT recovered here — that requires the user's password, which we
 * don't have on a cold boot. Callers must prompt for the password to
 * re-derive the key.
 */
export async function fetchCurrentSession(): Promise<User | null> {
  const stored = await readStoredToken();
  if (!stored) return null;
  setApiToken(stored);
  try {
    const res = await api.me();
    return { id: res.userId, email: res.email, encryptSalt: res.encryptSalt };
  } catch (err) {
    // Token expired or invalid — clear it so we don't keep retrying.
    if (err instanceof ApiRequestError && err.status === 401) {
      await clearStoredToken();
      setApiToken(null);
    }
    return null;
  }
}

/**
 * Re-derive the encryption key for an existing logged-in session. Used
 * when the user comes back to the app after a relaunch — we still have the
 * token (in Keychain) but not the password, so the user has to re-enter it
 * to unlock their data.
 */
export async function unlockSession(
  password: string,
  encryptSalt: string,
): Promise<{ ok: true } | { ok: false; error: AuthError }> {
  try {
    const key = await deriveDataKey(password, encryptSalt);
    setEncryptionKey(key);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: { message: err instanceof Error ? err.message : "Couldn't derive key." },
    };
  }
}

/** Log out — clears server cookie (best-effort), in-memory key, and stored token. */
export async function logoutUser(): Promise<void> {
  setEncryptionKey(null);
  try {
    await api.logout();
  } catch {
    // Best-effort; the token will be discarded client-side regardless.
  }
  await clearStoredToken();
  setApiToken(null);
}
