# Qitlo Mobile — Plan

iOS-first React Native + Expo app, sibling folder to the existing Next.js webapp at `/Users/shabach/Documents/Qitlo-Project`. The pure tax engine is shared via `Qitlo-Shared`; auth, storage, and sync follow the webapp's current E2EE backend model. UI is rebuilt for native.

> **Architecture pivot since v1 of this doc.** The original plan described mobile as local-first (mirroring the webapp's README). The webapp has since shipped a server-backed E2EE sync model: Prisma + bcrypt for identity, `jose` JWT for sessions, AES-GCM ciphertext blobs sync via `/api/sync`. Mobile now joins that same model so a phone and a laptop share one encrypted blob.

---

## 1. Folder layout

```
/Users/shabach/Documents/
├── Qitlo-Project/    Next.js 16 webapp, Prisma backend, /api/auth + /api/sync
├── Qitlo-Mobile/     Expo SDK 54, React Native 0.81, expo-router file routing
└── Qitlo-Shared/     Pure TypeScript — tax engine, federal/state data,
                       debt classifier. NO DOM, NO RN, NO crypto-platform deps.
```

Both apps depend on `Qitlo-Shared` via `file:../Qitlo-Shared`. The webapp re-exports from `qitlo-shared` through three thin shims at `src/lib/{taxEngine,stateTaxData,federalTaxData}.ts` so existing `@/lib/*` import paths keep working.

## 2. What's shared (pure TypeScript)

These files moved from `Qitlo-Project/src/lib/` into `Qitlo-Shared/src/` and are imported, not duplicated:

- `taxEngine.ts` — `calculateProgressiveTax`, `calculateFederalTax`, `calculateSelfEmploymentTax`, `calculateTaxImpact`, `normalizeTaxProfile`
- `stateTaxData.ts` — all 51 jurisdictions, `getStateConfig`, `getLocality`
- `federalTaxData.ts` — 2025 brackets, standard deduction, SS wage base, Additional Medicare thresholds
- `classifyDebt.ts` — debt-interest classifier (lifted from `page.tsx`)

Verification: `Qitlo-Shared/__tests__/smoke.ts` runs the four README scenarios (W-2 $80k, freelancer $100k/$5k, freelancer $200k/$20k, MFJ $400k). All pass against `qitlo-shared` so both apps produce identical numbers by construction.

## 3. Platform layer — mobile twin of each webapp concern

| Concern | Webapp (existing) | Mobile (built) |
| --- | --- | --- |
| Password hashing | `crypto.subtle` PBKDF2-SHA-256 (600k) | `@noble/hashes` PBKDF2-SHA-256 (600k) |
| Data encryption | `crypto.subtle` AES-GCM-256 (12-byte IV) | `@noble/ciphers` AES-GCM-256 (12-byte IV) |
| `deriveAuthPassword` | SHA-256 of `email + ":" + password + ":qitlo-auth-v1"` | Identical (verified byte-for-byte in round-trip test) |
| Random bytes | `crypto.getRandomValues` | `react-native-get-random-values` polyfills `crypto.getRandomValues` |
| Identity | `/api/auth/signup`, `/login`, `/logout`, `/me` over fetch + cookie | Same routes, Bearer token instead of cookie |
| Session transport | httpOnly cookie `qitlo_session` | `Authorization: Bearer <jwt>` |
| Token storage | Server-managed cookie | `expo-secure-store` (iOS Keychain / Android Keystore) |
| App state | React state + `/api/sync` blob | React state + `/api/sync` blob + AsyncStorage offline cache |
| Sync wire format | `{ ciphertext, iv, version }` | Identical (proven via `cryptoRoundtrip.mjs`) |

The webapp's auth routes were extended to support both transports in parallel — see `Qitlo-Project/src/lib/session.ts`'s `signSessionToken` / `getSessionUserIdFromRequest`. Web behavior is unchanged; mobile gets a Bearer path.

## 4. Mobile-only wins (built or queued)

| Win | Status |
| --- | --- |
| AsyncStorage offline cache for the decrypted blob | Built — app renders the last-known journal before the network call returns |
| Bearer token in iOS Keychain | Built — `expo-secure-store` with `AFTER_FIRST_UNLOCK` accessibility |
| Unlock-on-relaunch UX | Built — token survives relaunches; user re-enters password to rederive the AES-GCM key |
| Optimistic local writes + serialized push | Built — `AppStateProvider.updateBlob` chains pushes so two rapid taps never race a version |
| Face ID / Touch ID app unlock | Queued for Phase 6 (`expo-local-authentication`) |
| Local push notifications for backup reminders | Queued for Phase 4 (`expo-notifications`) |
| iCloud Drive secondary export | Queued for Phase 4 — `expo-file-system` writes the same `AutoBackupFile` shape the webapp's `autoBackup.ts` writes |

## 5. Routes and screens

Expo-router file-based routing:

```
app/
├── _layout.tsx         AppStateProvider + auth gate + Stack
├── login.tsx           sign up / log in (segmented)
├── unlock.tsx          re-enter password on relaunch
└── (tabs)/
    ├── _layout.tsx     bottom tab nav with Ionicons
    ├── index.tsx       Dashboard — built (hero estimate, fed/SE toggles,
    │                                     breakdown, recent entries, sync pill)
    ├── journal.tsx     placeholder
    ├── rules.tsx       placeholder
    ├── debt.tsx        placeholder
    └── report.tsx      placeholder
```

The auth gate (in `_layout.tsx`'s `AuthGate` hook) redirects based on `AppState.status`:
- `loading` → BootScreen
- `no_session` → `/login`
- `locked` → `/unlock`
- `unlocked` → `/(tabs)`

## 6. Dependencies

```
expo                                      ~54.0.33
expo-router                                ~4.0.0    (file-based routing)
expo-linking                               ~7.0.0    (deep linking, required by router)
expo-secure-store                          ~14.0.0   (Keychain for Bearer token)
expo-status-bar                            ~3.0.9
@expo/vector-icons                         (bundled)  Ionicons for tab bar
@noble/hashes                              ^1.5.0    PBKDF2 + SHA-256
@noble/ciphers                             ^1.0.0    AES-GCM-256
react-native-get-random-values             ~1.11.0   polyfills crypto.getRandomValues
@react-native-async-storage/async-storage  ~2.1.0    offline blob cache
react-native-safe-area-context             ~5.0.0
react-native-screens                       ~4.4.0
```

No UI library — every control is hand-rolled against `src/lib/theme.ts` design tokens.

## 7. Phase status

| # | Phase | Status |
| --- | --- | --- |
| 0 | Scaffold + shared engine smoke test | Done — 4/4 README scenarios pass |
| 1 | Webapp consumes `qitlo-shared` | Done — three thin re-export shims |
| 2 | Crypto shim + API + token + sync | Done — 8/8 round-trip crypto tests pass, mobile API client / auth.ts / sync.ts / AppStateProvider built |
| 3 | Core screens | In progress — Dashboard built; Journal / Debt / entry editor pending |
| 4 | Account + backup UX | Pending — Settings, manual export, iCloud auto-backup |
| 5 | Tax Rules + Help + Tour | Pending — per-state Tax Rules screen, full Help center, spotlight onboarding |
| 6 | Polish + ship | Pending — Face ID, dark/light parity, accessibility, TestFlight |

## 8. How to run on your Mac

1. `cd /Users/shabach/Documents/Qitlo-Shared && npm install && npm run build`
2. `cd /Users/shabach/Documents/Qitlo-Project && npm install && npm run dev` — boots the Next.js backend on `http://localhost:3000`
3. `cd /Users/shabach/Documents/Qitlo-Mobile` and (if a stale sandbox install lingered) `rm -rf node_modules package-lock.json`
4. Create `Qitlo-Mobile/.env`:
   ```
   EXPO_PUBLIC_API_URL=http://localhost:3000
   ```
   (For TestFlight / production, replace with your Vercel URL. The current default in `api.ts` is `https://qitlo.vercel.app`.)
5. `npm install && npx expo start`
6. Press `i` (iOS Simulator) or scan the QR with Expo Go on your iPhone.
7. Sign up an account → it round-trips through your local Next.js backend. Open the webapp at `http://localhost:3000`, log in with the same email/password, and the entries you add on the phone show up on the web.

## 9. Round-trip verification (offline)

`Qitlo-Shared/__tests__/cryptoRoundtrip.mjs` proves the wire format is byte-for-byte compatible between Web Crypto (webapp) and `@noble/*` (mobile). All eight checks pass:

- PBKDF2-SHA-256 produces identical 32-byte output for the same `(password, salt, iterations)`
- `deriveAuthPassword` produces the identical 44-char base64 hash
- Encrypted backups round-trip: web encrypts → mobile decrypts, and vice versa
- Sealed sync payloads round-trip in both directions

A signup performed in the mobile app will produce the exact same `authHash` the server already accepts from the webapp — no server-side algorithm changes were needed.

## 10. Known caveats

- **Path resolution gotcha.** The `qitlo-shared` `file:` dependency path differs between the sandbox where I worked (`file:../Documents/Qitlo-Shared`) and your host (`file:../Qitlo-Shared`). If `npm install` fails to resolve it on your Mac, change `package.json`'s `qitlo-shared` line to `"file:../Qitlo-Shared"`.
- **Mobile `node_modules` may be in an unhealthy state** from sandbox install attempts. Recommended: `rm -rf Qitlo-Mobile/node_modules Qitlo-Mobile/package-lock.json && npm install` once on your Mac.
- **Backend URL is a placeholder.** `EXPO_PUBLIC_API_URL` defaults to `https://qitlo.vercel.app`. Set the env var in `Qitlo-Mobile/.env` or update the constant in `src/lib/api.ts`.
- **Local dev needs HTTP not HTTPS.** iOS App Transport Security blocks plain HTTP by default. For simulator dev pointing at `http://localhost:3000`, add `NSAllowsArbitraryLoads` true to `app.json` → `ios.infoPlist`, OR use a service like `ngrok` to expose your local backend over HTTPS.

## 11. Open questions for later phases

- **Sample data on first launch.** Should a brand-new account ship with seeded example entries (matches webapp behavior) or stay empty? Currently mobile starts empty.
- **iCloud Drive backup.** Is server-backed sync sufficient, or do you also want the iCloud secondary backup path (matches webapp's FSA folder)? Defer to Phase 4.
- **Cross-tab / cross-device conflict UX.** Today: last-write-wins, with a "conflict" sync status. If two devices edit simultaneously, the latest push wins. Real CRDT merging is roadmap-only.
- **Apple Developer account.** $99/yr, needed for TestFlight in Phase 6.
