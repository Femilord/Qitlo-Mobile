/**
 * Secure persistence for the Bearer session token.
 *
 * Backed by expo-secure-store (iOS Keychain / Android Keystore). The token
 * lives here and in api.ts's in-memory cache; auth.ts is responsible for
 * keeping them in sync. We never log the token, never put it in
 * AsyncStorage, and never include it in error messages.
 */

import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "qitlo.session.token";

export async function readStoredToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    // Keychain is unavailable in rare cases (e.g., simulator misconfig).
    // We treat this as "no token" rather than crashing the app boot.
    return null;
  }
}

export async function writeStoredToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(TOKEN_KEY, token, {
    // Token is needed at app boot for the /api/auth/me call before the user
    // unlocks the device with biometrics in a future iteration. Standard
    // protection level is fine for v1.
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

export async function clearStoredToken(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Best-effort. If it fails, we still treat the user as logged out from
    // the rest of the app's perspective.
  }
}
