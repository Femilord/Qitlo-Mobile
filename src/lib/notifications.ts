/**
 * OS notifications for spending-limit alerts.
 *
 * Wraps expo-notifications with:
 *   - permission request/check helpers (used by the Limits settings toggle), and
 *   - `syncLimitNotifications`, a dedupe layer that fires a local notification
 *     at most once per (period, category) escalation so the user isn't spammed
 *     on every keystroke/sync.
 *
 * The in-app banner on the dashboard is independent of this module and always
 * renders; this only governs the OS-level notification.
 *
 * Requires the `expo-notifications` package:
 *     npx expo install expo-notifications
 * Until it's installed the bundle won't build (a static import). All runtime
 * calls are wrapped in try/catch so a denied permission or an unsupported
 * environment (e.g. some Expo Go limitations) degrades to "no OS notification"
 * rather than throwing.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";

import type { LimitLevel } from "qitlo-shared";

// While the app is foregrounded, still surface the alert as a banner.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** True if we currently hold permission to post notifications. */
export async function getNotificationPermission(): Promise<boolean> {
  try {
    const s = await Notifications.getPermissionsAsync();
    return (
      s.granted ||
      s.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    );
  } catch {
    return false;
  }
}

/**
 * Ask the OS for notification permission (no-op prompt if already granted).
 * Returns whether permission is granted afterward.
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (
      existing.granted ||
      existing.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    ) {
      return true;
    }
    if (existing.canAskAgain === false) return false;
    const req = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
    return (
      req.granted ||
      req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
    );
  } catch {
    return false;
  }
}

/** Present a local notification immediately. Silent on failure. */
async function presentNow(title: string, body: string): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null, // deliver right away
    });
  } catch {
    // Permission revoked, unsupported in this runtime, etc. — ignore.
  }
}

/* ------------------------------------------------------------------ */
/* Dedupe state — "what level have we already alerted on, this period" */
/* ------------------------------------------------------------------ */

type CatInput = { level: LimitLevel; title: string; body: string };

type NotifiedRecord = {
  periodKey: string;
  personal: LimitLevel;
  business: LimitLevel;
};

const RANK: Record<LimitLevel, number> = { ok: 0, warn: 1, over: 2 };

const recordKey = (userId: string) => `qitlo_limit_notified_${userId}`;

/**
 * Reconcile the current limit levels against what we last notified for this
 * period, firing an OS notification only on a *new* escalation (ok→warn,
 * warn→over, ok→over). A drop in level (entry deleted, spend fell back) resets
 * the marker so a later re-crossing alerts again.
 *
 * When `enabled` is false we never post and never advance the marker, so the
 * moment the user turns notifications on, a currently-breached limit will
 * alert on the next evaluation.
 *
 * Storing only the current period auto-prunes old months.
 */
export async function syncLimitNotifications(opts: {
  userId: string;
  periodKey: string;
  enabled: boolean;
  personal: CatInput;
  business: CatInput;
}): Promise<void> {
  const key = recordKey(opts.userId);

  let rec: NotifiedRecord = {
    periodKey: opts.periodKey,
    personal: "ok",
    business: "ok",
  };
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NotifiedRecord>;
      if (parsed && parsed.periodKey === opts.periodKey) {
        rec = {
          periodKey: opts.periodKey,
          personal: (parsed.personal as LimitLevel) ?? "ok",
          business: (parsed.business as LimitLevel) ?? "ok",
        };
      }
    }
  } catch {
    // Corrupt/missing — start fresh for this period.
  }

  for (const cat of ["personal", "business"] as const) {
    const cur = opts[cat].level;
    const prev = rec[cat];
    if (RANK[cur] > RANK[prev]) {
      // New escalation.
      if (opts.enabled && cur !== "ok") {
        await presentNow(opts[cat].title, opts[cat].body);
        rec[cat] = cur;
      }
      // If not enabled, leave the marker so enabling later still alerts.
    } else if (RANK[cur] < RANK[prev]) {
      // Spend fell back below a previously-alerted threshold — reset.
      rec[cat] = cur;
    }
  }

  try {
    await AsyncStorage.setItem(key, JSON.stringify(rec));
  } catch {
    // Best-effort; a failed write just means we might re-alert once.
  }
}
