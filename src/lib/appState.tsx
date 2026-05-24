/**
 * AppState provider — single source of truth for auth + blob + sync UI state.
 *
 * Owns:
 *   - status:     where the app is in the auth lifecycle
 *   - user:       identity bits from /api/auth/me or signup/login
 *   - blob:       the decrypted RemoteBlob<AppBlob> (or null if first sync)
 *   - syncStatus: pretty status string for the dashboard pill
 *
 * Hides:
 *   - The cached encryption key (lives in src/lib/auth.ts module memory)
 *   - The cached Bearer token (lives in src/lib/api.ts module memory + Keychain)
 *
 * Screens read state via useAppState() and trigger actions via the methods on
 * the returned object. The provider serializes pushes via a single in-flight
 * promise so a fast tapper can't race two PUTs onto the server.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  fetchCurrentSession,
  loginUser,
  logoutUser,
  signupUser,
  unlockSession,
  getEncryptionKey,
  type AuthError,
  type User,
} from "./auth";
import {
  pullBlob,
  pushBlob,
  readCachedBlob,
  clearCachedBlob,
  type RemoteBlob,
} from "./sync";
import type { DebtEntry, JournalEntry, TaxProfile, SpendingLimits, AppNotification } from "qitlo-shared";
import {
  DEFAULT_SPENDING_LIMITS,
  normalizeSpendingLimits,
  normalizeNotifications,
  mergeNotifications,
} from "qitlo-shared";

/** What we sync. Tiny v1 shape; grows as features land. */
export type AppBlob = {
  version: 1;
  taxProfile: TaxProfile;
  entries: JournalEntry[];
  debtEntries: DebtEntry[];
  /**
   * Monthly personal/business spending caps + alert prefs. Top-level (sibling
   * to entries) so the webapp reads/writes the exact same object — set a cap
   * on the phone and it shows on the web, and vice versa.
   */
  spendingLimits: SpendingLimits;
  /**
   * The in-app "bell" notification inbox. Synced top-level so the list (and
   * read/cleared state) converges across devices; conflicts union-merge.
   */
  notifications: AppNotification[];
  /**
   * Unknown fields from the remote blob that mobile doesn't render but
   * preserves on every push so cross-device data (webapp's `user` object,
   * any other top-level fields the webapp owns) survives even when the
   * phone writes back to the server. Mobile never reads or interprets
   * these — they're an opaque bag. Promoted fields (entries, debtEntries,
   * taxProfile) are NOT in passthrough; they live on AppBlob directly.
   */
  passthrough: Record<string, unknown>;
};

export const DEFAULT_BLOB: AppBlob = {
  version: 1,
  taxProfile: { taxYear: 2025, filingStatus: "single", state: "NY", dependents: 0 },
  entries: [],
  debtEntries: [],
  spendingLimits: { ...DEFAULT_SPENDING_LIMITS },
  notifications: [],
  passthrough: {},
};

/**
 * Defensively shape any decrypted blob into an AppBlob.
 *
 * The webapp and the mobile app are nominally on the same E2EE blob, but
 * their internal shapes have drifted (the webapp stores taxProfile nested
 * inside its User object; mobile keeps it at the top level). Older mobile
 * versions and future versions may also disagree on field placement.
 *
 * Rather than crash the Dashboard with "cannot read property 'state' of
 * undefined", we coerce whatever came in into something the rest of the
 * mobile app can render. Missing fields fall back to DEFAULT_BLOB values;
 * extra fields are dropped silently.
 *
 * If the user adds an entry on mobile, the next push writes the
 * mobile-shaped AppBlob back to the server, so over time the blob converges.
 * Until the webapp learns to read the mobile shape, this is a one-way
 * normalize on read.
 */
function normalizeAppBlob(raw: unknown): AppBlob {
  const data = (raw ?? {}) as Record<string, unknown>;
  // taxProfile can live at .taxProfile (mobile shape) or .user.taxProfile
  // (webapp shape). Prefer the former; fall back to the latter; otherwise
  // use the mobile default.
  const nestedUser = data.user as Record<string, unknown> | undefined;
  const rawProfile =
    (data.taxProfile as TaxProfile | undefined) ??
    (nestedUser?.taxProfile as TaxProfile | undefined) ??
    DEFAULT_BLOB.taxProfile;

  const safeProfile: TaxProfile = {
    taxYear: 2025,
    filingStatus: rawProfile?.filingStatus ?? DEFAULT_BLOB.taxProfile.filingStatus,
    state: rawProfile?.state ?? DEFAULT_BLOB.taxProfile.state,
    locality: rawProfile?.locality,
    dependents: Number.isFinite(rawProfile?.dependents) ? rawProfile.dependents : 0,
    residency: rawProfile?.residency,
  };

  const entries: JournalEntry[] = Array.isArray(data.entries)
    ? (data.entries as JournalEntry[]).filter(
        (e) =>
          e &&
          typeof e === "object" &&
          typeof e.id === "string" &&
          typeof e.amount === "number" &&
          typeof e.taxTreatment === "string",
      )
    : [];

  const debtEntries: DebtEntry[] = Array.isArray(data.debtEntries)
    ? (data.debtEntries as DebtEntry[]).filter(
        (d) =>
          d &&
          typeof d === "object" &&
          typeof d.id === "string" &&
          typeof d.name === "string" &&
          typeof d.interestPaid === "number" &&
          typeof d.type === "string" &&
          typeof d.use === "string",
      )
    : [];

  // spendingLimits lives at the top level (mobile shape). For older blobs the
  // webapp may have nested it under `user`; fall back to that, then defaults.
  const spendingLimits = normalizeSpendingLimits(
    (data.spendingLimits as unknown) ??
      (nestedUser?.spendingLimits as unknown) ??
      DEFAULT_SPENDING_LIMITS,
  );

  const notifications = normalizeNotifications(data.notifications);

  // Collect every key we don't explicitly model into passthrough so cross-
  // device pushes don't drop the webapp's `user` object and any other
  // top-level fields it owns. Promoted fields (taxProfile, entries,
  // debtEntries, spendingLimits, notifications) are NOT in passthrough; they're
  // on AppBlob directly.
  const KNOWN_KEYS = new Set([
    "version",
    "taxProfile",
    "entries",
    "debtEntries",
    "spendingLimits",
    "notifications",
    "passthrough",
  ]);
  const passthrough: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    if (!KNOWN_KEYS.has(key)) {
      passthrough[key] = data[key];
    }
  }
  // If a previous mobile push stored its own passthrough, fold it in too so
  // we don't lose anything across multiple mobile-side rounds.
  if (data.passthrough && typeof data.passthrough === "object") {
    Object.assign(passthrough, data.passthrough as Record<string, unknown>);
  }

  return {
    version: 1,
    taxProfile: safeProfile,
    entries,
    debtEntries,
    spendingLimits,
    notifications,
    passthrough,
  };
}

function normalizeRemoteBlob(remote: RemoteBlob<unknown>): RemoteBlob<AppBlob> {
  return {
    data: normalizeAppBlob(remote.data),
    version: remote.version,
    lastModified: remote.lastModified,
  };
}

export type AuthStatus =
  | "loading"        // boot — checking stored token
  | "no_session"     // no token, show /login
  | "locked"         // valid token, no encryption key — show /unlock
  | "unlocked";      // ready, blob loaded, render tabs

export type SyncStatus =
  | { kind: "idle" }
  | { kind: "syncing" }
  | { kind: "synced"; at: string; version: number }
  | { kind: "offline"; message: string }
  | { kind: "conflict" }
  | { kind: "error"; message: string };

type AppStateValue = {
  status: AuthStatus;
  user: User | null;
  blob: RemoteBlob<AppBlob> | null;
  syncStatus: SyncStatus;
  signIn: (args: { email: string; password: string }) => Promise<AuthError | null>;
  signUp: (args: { email: string; password: string }) => Promise<AuthError | null>;
  unlock: (password: string) => Promise<AuthError | null>;
  signOut: () => Promise<void>;
  updateBlob: (next: AppBlob) => Promise<void>;
  refresh: () => Promise<void>;
};

const AppStateContext = createContext<AppStateValue | null>(null);

export function useAppState(): AppStateValue {
  const ctx = useContext(AppStateContext);
  if (!ctx) {
    throw new Error("useAppState must be used inside <AppStateProvider>.");
  }
  return ctx;
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [user, setUser] = useState<User | null>(null);
  const [blob, setBlob] = useState<RemoteBlob<AppBlob> | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ kind: "idle" });

  // Serializes pushBlob calls so a rapid tapper never races two writes onto
  // the same version. Stored as a ref so changing it doesn't re-render.
  const pushChain = useRef<Promise<void>>(Promise.resolve());

  /* -------------------- boot: restore session ---------------------- */
  useEffect(() => {
    (async () => {
      const session = await fetchCurrentSession();
      if (!session) {
        setStatus("no_session");
        return;
      }
      setUser(session);
      // We have identity but no encryption key yet — user needs to unlock.
      setStatus("locked");
      // Pre-warm the cache so unlock → home renders the journal instantly.
      const cached = await readCachedBlob<unknown>();
      if (cached) {
        setBlob({
          data: normalizeAppBlob(cached.data),
          version: cached.version,
          lastModified: cached.lastModified,
        });
      }
    })();
  }, []);

  /* -------------------- pull blob after unlock --------------------- */
  const pullFromServer = useCallback(async () => {
    if (!getEncryptionKey()) return;
    setSyncStatus({ kind: "syncing" });
    try {
      const remote = await pullBlob<unknown>();
      if (remote) {
        const normalized = normalizeRemoteBlob(remote);
        setBlob(normalized);
        setSyncStatus({ kind: "synced", at: new Date().toISOString(), version: normalized.version });
      } else {
        // First sync for this user — seed an empty blob locally so the UI
        // has something to render. The first push will create the row.
        setBlob({ data: DEFAULT_BLOB, version: 0, lastModified: new Date().toISOString() });
        setSyncStatus({ kind: "synced", at: new Date().toISOString(), version: 0 });
      }
    } catch (err) {
      setSyncStatus({
        kind: "offline",
        message: err instanceof Error ? err.message : "Couldn't reach the server.",
      });
    }
  }, []);

  /* -------------------- auth actions ------------------------------- */
  const signIn = useCallback(
    async ({ email, password }: { email: string; password: string }): Promise<AuthError | null> => {
      const res = await loginUser({ email, password });
      if (res.error) return res.error;
      if (res.user) {
        setUser(res.user);
        setStatus("unlocked");
        await pullFromServer();
      }
      return null;
    },
    [pullFromServer],
  );

  const signUp = useCallback(
    async ({ email, password }: { email: string; password: string }): Promise<AuthError | null> => {
      const res = await signupUser({ email, password });
      if (res.error) return res.error;
      if (res.user) {
        setUser(res.user);
        setStatus("unlocked");
        // Fresh account — blob is empty, no network call needed.
        setBlob({ data: DEFAULT_BLOB, version: 0, lastModified: new Date().toISOString() });
        setSyncStatus({ kind: "synced", at: new Date().toISOString(), version: 0 });
      }
      return null;
    },
    [],
  );

  const unlock = useCallback(
    async (password: string): Promise<AuthError | null> => {
      if (!user) return { message: "No session to unlock." };
      const res = await unlockSession(password, user.encryptSalt);
      if (!res.ok) return res.error;
      setStatus("unlocked");
      await pullFromServer();
      return null;
    },
    [user, pullFromServer],
  );

  const signOut = useCallback(async () => {
    await logoutUser();
    await clearCachedBlob();
    setUser(null);
    setBlob(null);
    setSyncStatus({ kind: "idle" });
    setStatus("no_session");
  }, []);

  /* -------------------- blob mutation ------------------------------ */
  const updateBlob = useCallback(
    async (next: AppBlob) => {
      const baseVersion = blob?.version ?? 0;
      // Optimistic: update local state first so the UI is instant.
      const optimistic: RemoteBlob<AppBlob> = {
        data: next,
        version: baseVersion,
        lastModified: blob?.lastModified ?? new Date().toISOString(),
      };
      setBlob(optimistic);
      setSyncStatus({ kind: "syncing" });

      // Reconstruct the on-wire shape: spread passthrough first so our
      // explicit fields override duplicates, NOT the other way around. The
      // webapp's `user` and any other fields it owns ride along in every
      // push via passthrough. Mobile's promoted fields (taxProfile,
      // entries, debtEntries) overwrite at the top level.
      const wireData = {
        ...next.passthrough,
        version: next.version,
        taxProfile: next.taxProfile,
        entries: next.entries,
        debtEntries: next.debtEntries,
        spendingLimits: next.spendingLimits,
        notifications: next.notifications,
      };

      // Serialize pushes so two rapid-fire calls don't both submit
      // expectedVersion = baseVersion.
      pushChain.current = pushChain.current.then(async () => {
        // First push attempt. If the server has bumped the version since
        // this device last pulled (e.g., the webapp pushed in the
        // background), we'll get a 409 and have to re-merge.
        let attempt = await pushBlob<typeof wireData>(wireData, baseVersion);

        // Loop the auto-merge retry. Each conflict response includes the
        // server's current blob and version, so we can take its passthrough,
        // apply our intended entries/taxProfile on top, and push again at
        // the new version. We cap at MAX_RETRIES to avoid a runaway loop in
        // the (extremely unlikely) case where another client is pushing
        // continuously.
        const MAX_RETRIES = 5;
        let mergedFinal: AppBlob | null = null;
        let retries = 0;

        while (!attempt.ok && attempt.conflict && retries < MAX_RETRIES) {
          retries++;
          const serverNorm = normalizeRemoteBlob(attempt.conflict);
          const merged: AppBlob = {
            version: 1,
            // Mobile's intent overrides for the fields the user just edited.
            taxProfile: next.taxProfile,
            entries: next.entries,
            debtEntries: next.debtEntries,
            spendingLimits: next.spendingLimits,
            // Notifications are a shared append-only-ish log: union both sides
            // so an item added/read/cleared on either device isn't lost.
            notifications: mergeNotifications(
              next.notifications,
              serverNorm.data.notifications,
            ),
            // Server's passthrough wins for fields mobile doesn't model
            // (user, etc.) so we don't roll back webapp-only data.
            passthrough: serverNorm.data.passthrough,
          };
          const mergedWire = {
            ...merged.passthrough,
            version: merged.version,
            taxProfile: merged.taxProfile,
            entries: merged.entries,
            debtEntries: merged.debtEntries,
            spendingLimits: merged.spendingLimits,
            notifications: merged.notifications,
          };
          setSyncStatus({ kind: "syncing" });
          attempt = await pushBlob<typeof mergedWire>(mergedWire, serverNorm.version);
          mergedFinal = merged;
        }

        if (attempt.ok) {
          // The blob that landed is either `next` (no conflict path) or
          // `mergedFinal` (at least one merge happened).
          const landed = mergedFinal ?? next;
          setBlob({ data: landed, version: attempt.version, lastModified: attempt.lastModified });
          setSyncStatus({ kind: "synced", at: new Date().toISOString(), version: attempt.version });
        } else if (attempt.conflict) {
          // Hit the retry cap. Surface the conflict so the user knows their
          // last change couldn't land — likely means another client is in a
          // tight push loop.
          setBlob(normalizeRemoteBlob(attempt.conflict));
          setSyncStatus({ kind: "conflict" });
        } else {
          setSyncStatus({ kind: "error", message: attempt.message });
        }
      });
      await pushChain.current;
    },
    [blob],
  );

  /* -------------------- refresh ------------------------------------ */
  const refresh = useCallback(async () => {
    await pullFromServer();
  }, [pullFromServer]);

  const value = useMemo<AppStateValue>(
    () => ({
      status,
      user,
      blob,
      syncStatus,
      signIn,
      signUp,
      unlock,
      signOut,
      updateBlob,
      refresh,
    }),
    [status, user, blob, syncStatus, signIn, signUp, unlock, signOut, updateBlob, refresh],
  );

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}
