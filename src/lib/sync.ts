/**
 * Mobile sync layer.
 *
 * Mirrors Qitlo-Project/src/lib/sync.ts. Encrypts the user's app state with
 * the cached AES-GCM key (held in auth.ts module memory), pushes ciphertext
 * to the server, and pulls + decrypts on demand. The server is opaque to
 * the contents.
 *
 * Differences from web:
 *   - Caches the decrypted blob in AsyncStorage so the app can render
 *     immediately on cold boot (before the encryption key is rederived).
 *   - On unlock, the cached blob is replaced with whatever the server
 *     returns so a multi-device user gets the latest state.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { decryptWithKey, encryptWithKey, type SealedPayload } from "./crypto";
import { getEncryptionKey } from "./auth";
import { api, ApiRequestError } from "./api";

const CACHE_KEY = "qitlo.sync.blob.v1";

export type RemoteBlob<T> = {
  data: T;
  version: number;
  lastModified: string;
};

export type SyncStatus =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "synced"; at: string; version: number }
  | { kind: "offline" }
  | { kind: "conflict" }
  | { kind: "error"; message: string };

/* ------------------------------------------------------------------ */
/* Local cache — read on cold boot before the network is consulted     */
/* ------------------------------------------------------------------ */

type CachedBlob<T> = {
  data: T;
  version: number;
  lastModified: string;
  cachedAt: string;
};

export async function readCachedBlob<T>(): Promise<CachedBlob<T> | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CachedBlob<T>;
  } catch {
    return null;
  }
}

export async function writeCachedBlob<T>(blob: RemoteBlob<T>): Promise<void> {
  const value: CachedBlob<T> = {
    ...blob,
    cachedAt: new Date().toISOString(),
  };
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // Best-effort. Cache write failure shouldn't crash sync.
  }
}

export async function clearCachedBlob(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {
    /* swallow */
  }
}

/* ------------------------------------------------------------------ */
/* Network                                                              */
/* ------------------------------------------------------------------ */

/** Fetch the user's blob from the server and decrypt it. Returns null if
 *  no blob has been written yet (fresh signup). Updates the AsyncStorage
 *  cache on success. Throws if the encryption key isn't cached — caller
 *  must call unlockSession first. */
export async function pullBlob<T>(): Promise<RemoteBlob<T> | null> {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error("No encryption key cached. Unlock the session first.");
  }
  const res = await api.syncGet();
  if (!res.blob) return null;
  const sealed: SealedPayload = {
    algo: "AES-GCM-256",
    iv: res.blob.iv,
    ciphertext: res.blob.ciphertext,
  };
  const data = await decryptWithKey<T>(sealed, key);
  const remote: RemoteBlob<T> = {
    data,
    version: res.blob.version,
    lastModified: res.blob.lastModified,
  };
  await writeCachedBlob(remote);
  return remote;
}

/** Encrypt and upload the user's app state. `expectedVersion` should be the
 *  version of the blob this push is based on (0 for first push). On version
 *  conflict (HTTP 409) the response includes the server's current blob;
 *  callers can use it to re-sync before retrying. */
export async function pushBlob<T>(
  data: T,
  expectedVersion: number,
): Promise<
  | { ok: true; version: number; lastModified: string }
  | { ok: false; conflict?: RemoteBlob<T>; message: string }
> {
  const key = getEncryptionKey();
  if (!key) {
    return { ok: false, message: "No encryption key cached." };
  }

  let sealed: SealedPayload;
  try {
    sealed = await encryptWithKey(data, key);
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Encryption failed.",
    };
  }

  try {
    const res = await api.syncPut({
      ciphertext: sealed.ciphertext,
      iv: sealed.iv,
      expectedVersion,
    });
    await writeCachedBlob({
      data,
      version: res.version,
      lastModified: res.lastModified,
    });
    return { ok: true, version: res.version, lastModified: res.lastModified };
  } catch (err) {
    if (err instanceof ApiRequestError && err.status === 409 && err.body) {
      // Server has a newer copy. Decrypt it for the caller.
      const body = err.body as unknown as {
        current?: { ciphertext: string; iv: string; version: number; lastModified: string };
      };
      if (body.current) {
        try {
          const remote = await decryptWithKey<T>(
            { algo: "AES-GCM-256", iv: body.current.iv, ciphertext: body.current.ciphertext },
            key,
          );
          const conflictBlob: RemoteBlob<T> = {
            data: remote,
            version: body.current.version,
            lastModified: body.current.lastModified,
          };
          await writeCachedBlob(conflictBlob);
          return {
            ok: false,
            conflict: conflictBlob,
            message: "Version conflict — server has a newer copy.",
          };
        } catch {
          return { ok: false, message: "Couldn't decrypt server's newer copy." };
        }
      }
      return { ok: false, message: "Version conflict." };
    }
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Sync push failed.",
    };
  }
}
