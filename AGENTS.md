# Qitlo Mobile — agent notes

This is the React Native + Expo companion to the Next.js webapp at `../Qitlo-Project`. Read `PLAN.md` first.

## Conventions

- TypeScript strict mode, matching the webapp.
- No UI kit. Every control is hand-rolled against the design tokens in `src/theme.ts`. Same discipline as the webapp's `globals.css`.
- Tax engine, federal/state data, and debt classifier live in `../Qitlo-Shared` and are imported, not copied. Never patch tax math in this folder — patch it in `Qitlo-Shared` so the webapp and mobile stay aligned.
- Wire format for encrypted backups is byte-for-byte compatible with the webapp. Any change to PBKDF2 params, AES-GCM envelope shape, or the `AutoBackupFile` schema must be made in both apps together.
- Plaintext passwords are never written to disk. Use `expo-secure-store` for the cached data key only; the password itself is released as soon as login completes.

## What NOT to do

- Don't reach for `localStorage`, `window`, `document`, or `crypto.subtle`. None of them exist in React Native.
- Don't install a UI library (Tamagui, NativeBase, gluestack, etc.). The webapp deliberately avoids these; the mobile app does too.
- Don't add a backend. Qitlo is local-first by design.
