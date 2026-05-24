# Qitlo Mobile

**The React Native / Expo client for [Qitlo](../Qitlo-Project) — a privacy-first,
end-to-end-encrypted US tax planner.**

This app is one of three packages in the Qitlo system. It renders the same
journal, live tax estimate, spending limits, and notification inbox as the web
app, talks to the same backend, and stays in sync through one end-to-end-encrypted
blob — a limit you set on your phone shows up on the web, and vice versa.

> For the **full system architecture**, the **E2EE sync model**, the **backend
> API**, and the **cryptography**, see the main README in
> [`../Qitlo-Project/README.md`](../Qitlo-Project/README.md). This file focuses
> on running and working in the mobile app.

---

## Contents

- [What this app does](#what-this-app-does)
- [Tech stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Configuration](#configuration)
- [Project structure](#project-structure)
- [How it works](#how-it-works)
- [Scripts](#scripts)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)

---

## What this app does

- **Live tax dashboard** — federal + SE + state + locality tax, quarterly
  set-aside, and effective rate, recomputed on every edit.
- **Journal** — add/edit dated income and expense entries with categories,
  notes, and tax treatment.
- **Debt impact** — log debts and see which interest may be tax-relevant.
- **Spending limits** — set monthly personal/business caps; an in-app banner
  warns at 80% and at 100%, with optional phone notifications.
- **Notification inbox** — a bell with an unread badge (on every tab) opens a
  synced list of spending alerts and backup reminders you can read and clear.
- **Encrypted export** — produce an encrypted backup file, byte-compatible with
  the web app's format.

All data is encrypted on the device before it syncs. The server never sees your
plaintext password or your decrypted journal.

---

## Tech stack

- **Expo SDK 54** · **React Native 0.81** · **React 19.1**
- **expo-router 6** (file-based routing)
- **TypeScript 5** (strict)
- **@noble/hashes** + **@noble/ciphers** — pure-JS crypto, byte-for-byte
  compatible with the web app's Web Crypto (so blobs decrypt across platforms)
- **expo-secure-store** (JWT in the Keychain) · **AsyncStorage** (blob cache)
- **expo-notifications** (OS alerts) · **expo-linear-gradient** · **expo-image-picker** · **expo-file-system** · **expo-sharing**
- **qitlo-shared** — the shared tax engine + spending-limit + notification logic,
  consumed via a `file:` dependency and a Metro `watchFolders` entry

---

## Prerequisites

- **Node.js 20+** and npm
- **Expo Go** on a physical device, or an iOS Simulator / Android emulator
- A **running Qitlo backend** to point at — either the webapp locally
  (`npm run dev` in `../Qitlo-Project`) or the deployed Vercel URL
- The sibling **`../Qitlo-Shared`** package, built (see step 1)

---

## Quick start

```bash
# 1. Build the shared core first — this app imports its compiled output.
cd ../Qitlo-Shared
npm install
npm run build

# 2. Install and run the mobile app.
cd ../Qitlo-Mobile
npm install                 # .npmrc sets legacy-peer-deps=true (see Troubleshooting)
cp .env.example .env        # then set EXPO_PUBLIC_API_URL (see Configuration)
npx expo start --clear
```

Scan the QR code with Expo Go, or press `i` / `a` for a simulator/emulator.

> Rebuilding `../Qitlo-Shared` is picked up automatically via the
> `node_modules/qitlo-shared` symlink + Metro `watchFolders` — no reinstall needed.

---

## Configuration

The only required setting is the backend base URL, in `.env`:

```bash
# iOS Simulator against a local webapp:
EXPO_PUBLIC_API_URL=http://localhost:3000

# Physical device on the same Wi-Fi (use your Mac's LAN IP):
EXPO_PUBLIC_API_URL=http://192.168.1.x:3000

# Deployed backend:
EXPO_PUBLIC_API_URL=https://<your-vercel-domain>
```

`.env` is gitignored. `EXPO_PUBLIC_`-prefixed variables are inlined into the
bundle at build time, so treat them as public (non-secret). The app calls
`/api/auth/signup`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, and
`/api/sync` against this base.

---

## Project structure

```
app/                         # expo-router routes (file = route)
  _layout.tsx                # root layout, font loading, auth gate, modal routes
  (tabs)/
    _layout.tsx              # tab bar
    index.tsx                # Dashboard (estimate, spending banner, alert trigger)
    journal.tsx              # Journal list
    debt.tsx                 # Debt impact
    rules.tsx, report.tsx    # placeholders (Phase 5/4)
  login.tsx, unlock.tsx      # auth screens
  entry.tsx, debt-entry.tsx  # editors (modal)
  profile.tsx, account.tsx   # tax profile + account/backup (modal)
  limits.tsx                 # spending-limits editor (modal)
  notifications.tsx          # notification inbox (modal)
  help.tsx                   # help (modal)
src/
  lib/
    appState.tsx             # AppState provider: auth + blob + sync (source of truth)
    api.ts, auth.ts, sync.ts # backend client, auth flows, blob pull/push
    crypto.ts                # @noble auth password + data key + AES-GCM
    tokenStore.ts            # JWT in expo-secure-store
    notifications.ts         # OS notification permission + delivery
    avatar.tsx, theme.ts
  components/
    AppHeader.tsx            # top bar: notification bell + badge + account menu
    QitloLogo.tsx, Avatar.tsx, Placeholder.tsx
metro.config.js              # watchFolders → ../Qitlo-Shared
.npmrc                       # legacy-peer-deps=true
```

---

## How it works

**Auth lifecycle** (driven by `appState.tsx` + the auth gate in `app/_layout.tsx`):

```
loading → no_session   → /login    (no token)
        → locked       → /unlock   (valid token, but no encryption key in memory)
        → unlocked     → (tabs)    (key derived, blob loaded)
```

The JWT lives in the Keychain (`expo-secure-store`) and survives relaunch, but
the AES-GCM key does not — so after a cold start you land on **/unlock** and
re-enter your password to rederive the key and decrypt the synced blob.

**Sync.** `appState.tsx` holds the decrypted blob and serializes pushes. On a
write it updates the UI optimistically, then `PUT`s the encrypted blob with the
version it last saw; a `409` triggers an auto-merge/retry. Mobile keeps any
web-owned fields it doesn't model (e.g. the web's `user` object) in a
`passthrough` bag and re-writes them every push, so a phone write never drops
web-only data. (Full model: main README → "End-to-end-encrypted sync model".)

**Crypto.** `crypto.ts` mirrors the web app exactly using `@noble`, so a blob
encrypted on web decrypts here and vice versa. ⚠️ The
`react-native-get-random-values` polyfill **must be imported before** `@noble`
(it's the first import in `crypto.ts`) or you'll get
`crypto.getRandomValues must be defined`.

**Shared logic.** Tax math, spending-limit evaluation, and the notification-log
helpers come from `qitlo-shared`. Rebuild that package after changing it.

---

## Scripts

| Script | Does |
| --- | --- |
| `npm start` / `npx expo start` | Start Metro / Expo dev server |
| `npm run ios` | Start on the iOS Simulator |
| `npm run android` | Start on an Android emulator |
| `npm run web` | Start the web target |
| `npm run typecheck` | `tsc --noEmit` |

---

## Troubleshooting

**`npm install` / `npx expo install` fails with `ERESOLVE`.**
Expo's strict peer deps + the `file:` shared dependency + occasional stray
packages trip npm. `.npmrc` sets `legacy-peer-deps=true`, so a plain
`npm install` works. If you see web-only packages (`react-dom`, `@radix-ui/*`)
in the tree (they don't belong here), do a clean reinstall:
`rm -rf node_modules package-lock.json && npm install`.

**`expo-notifications` "module not found" / app won't bundle.**
It's already pinned in `package.json`; run `npm install`. The bell/inbox are
plain React Native, but the dashboard imports `expo-notifications` for OS pushes,
so the package must be installed to bundle. Local notifications work in Expo Go
on iOS; for fully reliable delivery use a dev/standalone build.

**`crypto.getRandomValues must be defined`.**
Keep `import "react-native-get-random-values";` as the first import in
`src/lib/crypto.ts`, before any `@noble/*` import.

**`Unable to resolve module qitlo-shared`.**
Build it (`cd ../Qitlo-Shared && npm run build`) and confirm
`metro.config.js` includes `../Qitlo-Shared` in `watchFolders`. Restart Metro
with `npx expo start --clear`.

**"Conflict — pulled latest" after editing.**
A sync version mismatch (409). The app auto-merges and retries; a one-off
message is normal if another device pushed at the same time.

**Can't reach the backend / network errors.**
Check `EXPO_PUBLIC_API_URL`. On a physical device, `localhost` points at the
phone, not your Mac — use the Mac's LAN IP. After changing `.env`, restart with
`--clear`.

---

## Roadmap

- Per-state **Tax Rules** and year-to-date **Report** screens (currently
  placeholders).
- **Import** of encrypted backups on device (export already works).
- Native **Face ID / biometric** unlock.
- Reset the **backup-reminder** clock from a mobile export.
- **Push notifications** for limit alerts when the app isn't foregrounded
  (today's OS alerts are local/foreground-driven).

---

*Qitlo is a planning aid, not tax advice. Confirm figures with a qualified
professional before filing.*
