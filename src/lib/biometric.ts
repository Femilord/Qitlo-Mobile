/**
 * Biometric unlock — Face ID / Touch ID / Android biometrics.
 *
 * The E2EE model derives the AES-GCM data key from the user's password and
 * keeps it in memory only, so a cold start normally lands on /unlock to
 * re-enter the password. Biometric unlock removes that daily friction WITHOUT
 * weakening the model meaningfully:
 *
 *   - When the user opts in (while already unlocked), we store the derived key
 *     bytes in the Keychain / Android Keystore via expo-secure-store, marked
 *     WHEN_UNLOCKED_THIS_DEVICE_ONLY — it never leaves the device and never
 *     syncs to iCloud.
 *   - On a cold start, we gate access to that stored key behind an OS biometric
 *     check (expo-local-authentication). Only after a successful Face ID /
 *     Touch ID prompt do we read the key back and load it into memory.
 *   - The password unlock is always available as a fallback, and the stored key
 *     is wiped on sign-out.
 *
 * This is strictly more protected than the existing decrypted-blob cache (which
 * lives in AsyncStorage), and it replaces a shoulder-surfable password entry
 * with a hardware biometric. To fully hardware-bind the key on the Keychain
 * itself, set `requireAuthentication: true` on the setItem/getItem calls — left
 * off here for reliability across Expo Go + devices; the explicit prompt below
 * provides the gate.
 */

import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

import { fromB64, toB64, type DataKey } from "./crypto";

const KEY_ITEM = "qitlo.biometric.datakey.v1";
const ENABLED_ITEM = "qitlo.biometric.enabled.v1";

const STORE_OPTS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export type BiometricSupport = {
  /** Hardware present AND at least one biometric enrolled. */
  available: boolean;
  /** Human label for the strongest available method. */
  label: string;
};

/** Detect biometric capability and a friendly label ("Face ID" / "Touch ID"). */
export async function getBiometricSupport(): Promise<BiometricSupport> {
  try {
    const [hasHardware, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);
    let label = "Biometrics";
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      label = "Face ID";
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      label = "Touch ID";
    }
    return { available: hasHardware && enrolled, label };
  } catch {
    return { available: false, label: "Biometrics" };
  }
}

/** Whether the user has opted into biometric unlock on this device. */
export async function isBiometricEnabled(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ENABLED_ITEM)) === "1";
  } catch {
    return false;
  }
}

/** Run the OS biometric prompt. Returns true only on a successful match. */
export async function promptBiometric(promptMessage: string): Promise<boolean> {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: "Use password",
      // Allow the device passcode as a fallback so a failed scan isn't a dead end.
      disableDeviceFallback: false,
    });
    return res.success;
  } catch {
    return false;
  }
}

/** Persist the derived key (this-device-only) and flip the enabled flag. */
export async function enableBiometric(key: DataKey): Promise<boolean> {
  try {
    await SecureStore.setItemAsync(KEY_ITEM, toB64(key), STORE_OPTS);
    await SecureStore.setItemAsync(ENABLED_ITEM, "1", STORE_OPTS);
    return true;
  } catch {
    return false;
  }
}

/** Remove the stored key + flag. Called on opt-out and on sign-out. */
export async function disableBiometric(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY_ITEM);
  } catch {
    /* best-effort */
  }
  try {
    await SecureStore.deleteItemAsync(ENABLED_ITEM);
  } catch {
    /* best-effort */
  }
}

/** Read back the stored key. Call only AFTER a successful promptBiometric(). */
export async function readStoredKey(): Promise<DataKey | null> {
  try {
    const b64 = await SecureStore.getItemAsync(KEY_ITEM);
    if (!b64) return null;
    return fromB64(b64);
  } catch {
    return null;
  }
}
