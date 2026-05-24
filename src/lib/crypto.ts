/**
 * Crypto primitives for Qitlo Mobile.
 *
 * Mirrors the webapp's src/lib/crypto.ts contract so encrypted backups,
 * SealedPayloads, and auth-password derivations are byte-for-byte portable
 * between web and mobile. The webapp uses SubtleCrypto; we can't (RN has no
 * SubtleCrypto), so this implementation uses @noble/hashes and
 * @noble/ciphers — pure JS, well audited, fast enough on phones.
 *
 * What MUST stay identical to the webapp:
 *   - PBKDF2-SHA-256 with the same iteration counts (600k / 250k)
 *   - 16-byte salts, 12-byte IVs
 *   - AES-GCM-256
 *   - Base64 encoding (standard, not URL-safe; padding `=` retained on output)
 *   - SHA-256 of `email + ":" + password + ":qitlo-auth-v1"` for deriveAuthPassword
 *
 * Key shape difference: web's deriveDataKey returns a CryptoKey (opaque
 * handle); mobile returns a Uint8Array (raw 32-byte AES key). Both apps
 * keep their key in-memory only; both produce/consume the same SealedPayload
 * on the wire, so cross-platform round-trips work.
 *
 * IMPORTANT: import "react-native-get-random-values" at app entry once so
 * globalThis.crypto.getRandomValues is polyfilled before any module here
 * runs.
 */

// MUST be the first import in this file. @noble/hashes captures
// globalThis.crypto.getRandomValues at module load time, so the
// react-native-get-random-values polyfill has to install itself onto
// globalThis BEFORE @noble's module is evaluated. Importing it here
// guarantees the load order regardless of how Metro resolves other modules.
import "react-native-get-random-values";

import { pbkdf2Async } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha256";
import { randomBytes as nobleRandomBytes } from "@noble/hashes/utils";
import { gcm } from "@noble/ciphers/aes";
import { utf8ToBytes, bytesToUtf8 } from "@noble/ciphers/utils";

/** Iteration count for password hashing. Tuned to match the webapp. */
export const PBKDF2_ITERATIONS = 600_000;
/** Iteration count for symmetric data-key derivation. Matches the webapp. */
export const PBKDF2_DATA_ITERATIONS = 250_000;

const AES_KEY_BYTES = 32; // 256 bits
const AES_IV_BYTES = 12; // GCM standard
const SALT_BYTES = 16;
const PBKDF2_OUTPUT_BYTES = 32; // 256 bits

/** A raw AES-GCM key. On mobile this is a Uint8Array; on web it's a
 *  CryptoKey. Both are kept in memory only and cleared on logout. */
export type DataKey = Uint8Array;

/* ------------------------------------------------------------------ */
/* Random                                                              */
/* ------------------------------------------------------------------ */

function randomBytes(length: number): Uint8Array {
  // @noble/hashes/utils.randomBytes uses globalThis.crypto.getRandomValues
  // under the hood — the same source react-native-get-random-values
  // polyfills on RN.
  return nobleRandomBytes(length);
}

/* ------------------------------------------------------------------ */
/* Base64 — RN has globalThis.btoa/atob but only in newer versions.   */
/* Use a tolerant implementation that doesn't depend on either.        */
/* ------------------------------------------------------------------ */

const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function toB64(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  for (; i + 3 <= bytes.length; i += 3) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out += B64_ALPHABET[(n >> 18) & 63];
    out += B64_ALPHABET[(n >> 12) & 63];
    out += B64_ALPHABET[(n >> 6) & 63];
    out += B64_ALPHABET[n & 63];
  }
  const rem = bytes.length - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += B64_ALPHABET[(n >> 18) & 63];
    out += B64_ALPHABET[(n >> 12) & 63];
    out += "==";
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out += B64_ALPHABET[(n >> 18) & 63];
    out += B64_ALPHABET[(n >> 12) & 63];
    out += B64_ALPHABET[(n >> 6) & 63];
    out += "=";
  }
  return out;
}

const B64_LOOKUP: Record<string, number> = (() => {
  const map: Record<string, number> = {};
  for (let i = 0; i < B64_ALPHABET.length; i++) map[B64_ALPHABET[i]] = i;
  return map;
})();

export function fromB64(b64: string): Uint8Array {
  // Accept URL-safe variants too.
  const normalized = b64.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/g, "");
  const len = normalized.length;
  const outLen = Math.floor((len * 3) / 4);
  const out = new Uint8Array(outLen);
  let outIdx = 0;
  let buf = 0;
  let bits = 0;
  for (let i = 0; i < len; i++) {
    const c = normalized[i];
    const v = B64_LOOKUP[c];
    if (v === undefined) throw new Error("Invalid base64 character.");
    buf = (buf << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[outIdx++] = (buf >> bits) & 0xff;
    }
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Constant-time string compare                                        */
/* ------------------------------------------------------------------ */

export function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/* ------------------------------------------------------------------ */
/* Password hashing                                                    */
/* ------------------------------------------------------------------ */

export type PasswordHash = {
  algo: "PBKDF2-SHA256";
  iterations: number;
  salt: string; // base64
  hash: string; // base64
};

/**
 * PBKDF2-SHA-256 with the synchronous @noble implementation wrapped in an
 * async-yielding loop. On a phone, 250k iterations of SHA-256 in pure JS
 * takes 1-10 seconds; if we ran it synchronously, the JS thread would block
 * and React couldn't render the "Unlocking…" spinner. pbkdf2Async yields
 * control every ~10ms so the UI stays responsive.
 */
async function pbkdf2Bytes(
  password: string,
  salt: Uint8Array,
  iterations: number,
  bytes: number,
): Promise<Uint8Array> {
  return pbkdf2Async(sha256, utf8ToBytes(password), salt, {
    c: iterations,
    dkLen: bytes,
  });
}

export async function hashPassword(password: string): Promise<PasswordHash> {
  const salt = randomBytes(SALT_BYTES);
  const hash = await pbkdf2Bytes(password, salt, PBKDF2_ITERATIONS, PBKDF2_OUTPUT_BYTES);
  return {
    algo: "PBKDF2-SHA256",
    iterations: PBKDF2_ITERATIONS,
    salt: toB64(salt),
    hash: toB64(hash),
  };
}

export async function verifyPassword(
  password: string,
  record: PasswordHash,
): Promise<boolean> {
  if (record.algo !== "PBKDF2-SHA256") return false;
  const salt = fromB64(record.salt);
  const candidate = await pbkdf2Bytes(password, salt, record.iterations, PBKDF2_OUTPUT_BYTES);
  return constantTimeEqual(toB64(candidate), record.hash);
}

/* ------------------------------------------------------------------ */
/* Data-at-rest encryption — AES-GCM with PBKDF2-derived key          */
/* ------------------------------------------------------------------ */

export type EncryptedPayload = {
  algo: "AES-GCM-256";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64
};

async function deriveAesKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Promise<Uint8Array> {
  return pbkdf2Bytes(password, salt, iterations, AES_KEY_BYTES);
}

export async function encryptJson<T>(
  value: T,
  password: string,
  iterations: number = PBKDF2_DATA_ITERATIONS,
): Promise<EncryptedPayload> {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(AES_IV_BYTES);
  const key = await deriveAesKey(password, salt, iterations);
  const plaintext = utf8ToBytes(JSON.stringify(value));
  const ciphertext = gcm(key, iv).encrypt(plaintext);
  return {
    algo: "AES-GCM-256",
    kdf: "PBKDF2-SHA256",
    iterations,
    salt: toB64(salt),
    iv: toB64(iv),
    ciphertext: toB64(ciphertext),
  };
}

export async function decryptJson<T>(
  payload: EncryptedPayload,
  password: string,
): Promise<T> {
  if (payload.algo !== "AES-GCM-256" || payload.kdf !== "PBKDF2-SHA256") {
    throw new Error("Unsupported encryption format.");
  }
  const salt = fromB64(payload.salt);
  const iv = fromB64(payload.iv);
  const ciphertext = fromB64(payload.ciphertext);
  const key = await deriveAesKey(password, salt, payload.iterations);
  const plaintext = gcm(key, iv).decrypt(ciphertext);
  return JSON.parse(bytesToUtf8(plaintext)) as T;
}

/** Type guard so callers can distinguish encrypted vs. legacy/plain payloads. */
export function isEncryptedPayload(value: unknown): value is EncryptedPayload {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.algo === "AES-GCM-256" &&
    v.kdf === "PBKDF2-SHA256" &&
    typeof v.iterations === "number" &&
    typeof v.salt === "string" &&
    typeof v.iv === "string" &&
    typeof v.ciphertext === "string"
  );
}

/* ------------------------------------------------------------------ */
/* Reusable data key — derive once, reuse for many writes              */
/* ------------------------------------------------------------------ */

export type SealedPayload = {
  algo: "AES-GCM-256";
  iv: string; // base64
  ciphertext: string; // base64
};

export function randomSalt(): string {
  return toB64(randomBytes(SALT_BYTES));
}

/** Derive a 32-byte AES-GCM key from a password + persisted salt.
 *  Caller holds the result in memory only and clears on logout. */
export async function deriveDataKey(
  password: string,
  saltB64: string,
  iterations: number = PBKDF2_DATA_ITERATIONS,
): Promise<DataKey> {
  const salt = fromB64(saltB64);
  return await deriveAesKey(password, salt, iterations);
}

export async function encryptWithKey<T>(
  value: T,
  key: DataKey,
): Promise<SealedPayload> {
  const iv = randomBytes(AES_IV_BYTES);
  const plaintext = utf8ToBytes(JSON.stringify(value));
  const ciphertext = gcm(key, iv).encrypt(plaintext);
  return {
    algo: "AES-GCM-256",
    iv: toB64(iv),
    ciphertext: toB64(ciphertext),
  };
}

export async function decryptWithKey<T>(
  payload: SealedPayload,
  key: DataKey,
): Promise<T> {
  if (payload.algo !== "AES-GCM-256") {
    throw new Error("Unsupported sealed-payload format.");
  }
  const iv = fromB64(payload.iv);
  const ciphertext = fromB64(payload.ciphertext);
  const plaintext = gcm(key, iv).decrypt(ciphertext);
  return JSON.parse(bytesToUtf8(plaintext)) as T;
}

/* ------------------------------------------------------------------ */
/* Auth-password derivation for the E2EE sync backend                  */
/* ------------------------------------------------------------------ */

/**
 * Derive the "auth password" sent to the server during signup/login.
 * MUST match the webapp's deriveAuthPassword exactly: a SHA-256 of
 * `email + ":" + password + ":qitlo-auth-v1"`, base64-encoded.
 */
export async function deriveAuthPassword(
  email: string,
  password: string,
): Promise<string> {
  const input = `${email.trim().toLowerCase()}:${password}:qitlo-auth-v1`;
  const digest = sha256(utf8ToBytes(input));
  return toB64(digest);
}
