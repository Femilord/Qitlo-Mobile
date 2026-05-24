/**
 * Unlock screen — shown when we have a valid Bearer token (i.e., the user is
 * logged in on this device) but no encryption key is cached (i.e., the app
 * was relaunched since last unlock). User re-enters their password; we
 * rederive the AES-GCM key and decrypt the synced blob.
 */

import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { useAppState } from "../src/lib/appState";
import type { AuthError } from "../src/lib/auth";
import { getBiometricSupport, isBiometricEnabled } from "../src/lib/biometric";
import { QitloLogo } from "../src/components/QitloLogo";
import { colors, radii, spacing } from "../src/lib/theme";

export default function UnlockScreen() {
  const { user, unlock, unlockWithBiometric, signOut } = useAppState();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);

  // Biometric unlock: detect support + opt-in, and auto-prompt once on mount
  // so a returning user gets Face ID / Touch ID immediately, with the password
  // field as a silent fallback.
  const [bio, setBio] = useState({ available: false, enabled: false, label: "Biometrics" });
  const [bioBusy, setBioBusy] = useState(false);
  const autoTried = useRef(false);

  async function runBiometric() {
    setError(null);
    setBioBusy(true);
    // On success the provider flips to "unlocked" and this screen unmounts;
    // on cancel/failure we just stay here with the password field.
    await unlockWithBiometric();
    setBioBusy(false);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const support = await getBiometricSupport();
      const enabled = await isBiometricEnabled();
      if (cancelled) return;
      setBio({ available: support.available, enabled, label: support.label });
      if (support.available && enabled && !autoTried.current) {
        autoTried.current = true;
        void runBiometric();
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!user) {
    // Defensive — this screen shouldn't render without a user.
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </SafeAreaView>
    );
  }

  async function submit() {
    setError(null);
    setBusy(true);
    const err = await unlock(password);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}>
            <QitloLogo size="md" animating={busy} />
          </View>
          <Text style={styles.eyebrow}>Unlock</Text>
          <Text style={styles.title}>{user.email}</Text>
          <Text style={styles.subtitle}>
            Re-enter your password to decrypt your data on this device.
          </Text>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              placeholder="Your password"
              placeholderTextColor={colors.textPlaceholder}
              style={styles.input}
            />
          </View>

          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error.message}</Text>
            </View>
          )}

          <Pressable
            onPress={submit}
            disabled={busy}
            style={[styles.primaryBtn, busy && styles.primaryBtnDisabled]}
          >
            {busy ? (
              <ActivityIndicator color={colors.accentText} />
            ) : (
              <Text style={styles.primaryBtnText}>Unlock</Text>
            )}
          </Pressable>

          {bio.available && bio.enabled && (
            <Pressable
              onPress={runBiometric}
              disabled={bioBusy || busy}
              style={[styles.bioBtn, (bioBusy || busy) && styles.primaryBtnDisabled]}
            >
              {bioBusy ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <>
                  <Ionicons
                    name={bio.label === "Face ID" ? "scan-outline" : "finger-print"}
                    size={18}
                    color={colors.accent}
                  />
                  <Text style={styles.bioBtnText}>Use {bio.label}</Text>
                </>
              )}
            </Pressable>
          )}

          <Pressable onPress={signOut} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>Use a different account</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex1: { flex: 1 },
  scroll: { padding: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xxl + 32 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  brandRow: { marginBottom: spacing.lg },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: "700" },
  subtitle: { color: colors.textMuted, fontSize: 14, marginTop: 4 },

  field: { marginTop: spacing.xl },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 16,
  },

  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.xl,
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: colors.accentText, fontSize: 16, fontWeight: "700" },

  bioBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: spacing.md,
    paddingVertical: 13,
    borderRadius: radii.lg,
    backgroundColor: colors.successSurface,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  bioBtnText: { color: colors.accent, fontSize: 15, fontWeight: "700" },

  secondaryBtn: { alignItems: "center", marginTop: spacing.lg, paddingVertical: 12 },
  secondaryBtnText: { color: colors.textMuted, fontSize: 14 },

  errorBox: {
    marginTop: spacing.lg,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.errorSurface,
    borderWidth: 1,
    borderColor: colors.errorBorder,
  },
  errorText: { color: colors.error, fontSize: 13 },
});
