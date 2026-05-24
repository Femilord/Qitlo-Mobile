/**
 * Login / signup screen.
 *
 * Single segmented form for both flows since the inputs are identical and
 * the server contract is split only by which endpoint we POST to.
 */

import { useState } from "react";
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

import { useAppState } from "../src/lib/appState";
import type { AuthError } from "../src/lib/auth";
import { QitloLogo } from "../src/components/QitloLogo";
import { colors, radii, spacing } from "../src/lib/theme";

export default function LoginScreen() {
  const { signIn, signUp } = useAppState();
  const [mode, setMode] = useState<"signup" | "login">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<AuthError | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setError(null);
    setBusy(true);
    const fn = mode === "signup" ? signUp : signIn;
    const err = await fn({ email, password });
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
            <QitloLogo size="lg" animating={busy} />
          </View>
          <Text style={styles.title}>
            {mode === "signup" ? "Create an account" : "Welcome back"}
          </Text>
          <Text style={styles.subtitle}>
            {mode === "signup"
              ? "Your password never leaves the device."
              : "Sign in to sync your tax journal."}
          </Text>

          <View style={styles.segmented}>
            <Pressable
              onPress={() => setMode("login")}
              style={[styles.segmentBtn, mode === "login" && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentText, mode === "login" && styles.segmentTextActive]}>
                Log in
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setMode("signup")}
              style={[styles.segmentBtn, mode === "signup" && styles.segmentBtnActive]}
            >
              <Text style={[styles.segmentText, mode === "signup" && styles.segmentTextActive]}>
                Sign up
              </Text>
            </Pressable>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@example.com"
              placeholderTextColor={colors.textPlaceholder}
              style={styles.input}
            />
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              placeholder={
                mode === "signup" ? "At least 10 characters, 3 of 4 classes" : "Your password"
              }
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
              <Text style={styles.primaryBtnText}>
                {mode === "signup" ? "Create account" : "Log in"}
              </Text>
            )}
          </Pressable>

          <Text style={styles.helperText}>
            The webapp and the phone share one encrypted blob — anything you log
            on one shows up on the other.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex1: { flex: 1 },
  scroll: { padding: spacing.xl, paddingTop: spacing.xxl, paddingBottom: spacing.xxl + 32 },

  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  brandRow: { marginBottom: spacing.xl },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: "700" },
  subtitle: { color: colors.textMuted, fontSize: 14, marginTop: 4 },

  segmented: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 4,
    marginTop: spacing.xl,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: radii.md },
  segmentBtnActive: { backgroundColor: colors.bg },
  segmentText: { color: colors.textMuted, fontSize: 14, fontWeight: "500" },
  segmentTextActive: { color: colors.textPrimary, fontWeight: "600" },

  field: { marginTop: spacing.lg + 2 },
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

  errorBox: {
    marginTop: spacing.lg,
    padding: 12,
    borderRadius: radii.md,
    backgroundColor: colors.errorSurface,
    borderWidth: 1,
    borderColor: colors.errorBorder,
  },
  errorText: { color: colors.error, fontSize: 13 },

  helperText: { color: colors.textDim, fontSize: 12, marginTop: spacing.lg + 2, lineHeight: 18 },
});
