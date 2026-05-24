/**
 * Account screen — modal route at /account.
 *
 * Read-only profile info (email, display name from passthrough.user),
 * sign-out button, and an "Export encrypted backup" flow. The export builds
 * an EncryptedBackup envelope identical to what the webapp produces, so the
 * file can be re-imported on the webapp for cross-device recovery.
 *
 * Display-name editing isn't supported on mobile yet because the webapp
 * holds the name inside its `user` object, which mobile preserves via
 * passthrough but doesn't own. Editing would risk shape drift; Phase 4
 * polish will add a proper user-object editor.
 *
 * Email change isn't supported anywhere yet — would invalidate the
 * server-stored auth hash (which is derived from email).
 */

import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

import { useAppState } from "../src/lib/appState";
import { encryptJson } from "../src/lib/crypto";
import { getBiometricSupport, isBiometricEnabled } from "../src/lib/biometric";
import { colors, radii, spacing } from "../src/lib/theme";

/** Mirror of the webapp's Backup / EncryptedBackup format so files
 *  written from mobile can be imported on the webapp without changes. */
type EncryptedBackup = {
  app: "qitlo";
  version: 1;
  exportedAt: string;
  encrypted: Awaited<ReturnType<typeof encryptJson>>;
};

export default function AccountScreen() {
  const router = useRouter();
  const { user, blob, signOut, enableBiometricUnlock, disableBiometricUnlock } =
    useAppState();

  const [exportPassphrase, setExportPassphrase] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Biometric unlock toggle state. Loaded from the device on mount.
  const [bioSupport, setBioSupport] = useState({ available: false, label: "Biometrics" });
  const [bioEnabled, setBioEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const support = await getBiometricSupport();
      const enabled = await isBiometricEnabled();
      if (cancelled) return;
      setBioSupport(support);
      setBioEnabled(enabled);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onToggleBiometric(next: boolean) {
    if (next) {
      const ok = await enableBiometricUnlock();
      if (ok) {
        setBioEnabled(true);
      } else {
        Alert.alert(
          "Couldn't enable",
          `${bioSupport.label} authentication was canceled or isn't set up on this device.`,
        );
      }
    } else {
      await disableBiometricUnlock();
      setBioEnabled(false);
    }
  }

  // Display name comes from the webapp's user object stored in passthrough.
  const passUser = (blob?.data.passthrough.user as { name?: string } | undefined) ?? undefined;
  const displayName = passUser?.name ?? "";

  async function doExport() {
    if (exportPassphrase.length < 8) {
      Alert.alert("Pick a longer passphrase", "Use at least 8 characters.");
      return;
    }
    if (!blob) return;
    setExporting(true);
    try {
      // Reconstruct the wire shape the webapp expects inside the encrypted
      // payload: { user, entries, debtEntries }. Mobile reads `user` from
      // passthrough so cross-platform format compatibility is preserved.
      const payload = {
        user: passUser ?? { email: user?.email, name: "" },
        entries: blob.data.entries,
        debtEntries: blob.data.debtEntries,
      };
      const encrypted = await encryptJson(payload, exportPassphrase);
      const envelope: EncryptedBackup = {
        app: "qitlo",
        version: 1,
        exportedAt: new Date().toISOString(),
        encrypted,
      };

      // Write to a temp file the share sheet can hand off to other apps
      // (Files, Mail, Messages, Dropbox, etc.). expo-file-system needs a
      // file:// path; documentDirectory is sandboxed and writable.
      const filename = `qitlo-encrypted-${new Date().toISOString().slice(0, 10)}.json`;
      const path = `${FileSystem.documentDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(path, JSON.stringify(envelope, null, 2), {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert(
          "Sharing unavailable",
          `File written to:\n${path}\n\nThe iOS share sheet isn't available in this environment.`,
        );
        setExporting(false);
        return;
      }

      await Sharing.shareAsync(path, {
        mimeType: "application/json",
        dialogTitle: "Save your encrypted Qitlo backup",
        UTI: "public.json",
      });

      setExporting(false);
      setExportOpen(false);
      setExportPassphrase("");
    } catch (err) {
      setExporting(false);
      Alert.alert(
        "Export failed",
        err instanceof Error ? err.message : "Couldn't write the backup file.",
      );
    }
  }

  async function onSignOut() {
    Alert.alert(
      "Sign out?",
      "Your data stays safe on the server. You'll need your password to sign back in.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            await signOut();
            router.dismissAll?.();
            router.replace("/login");
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.headerBtn}
        >
          <Text style={styles.headerBtnText}>Done</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Account</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* Identity card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Signed in as</Text>
          <Row label="Email" value={user?.email ?? "—"} />
          <Row
            label="Display name"
            value={displayName || "Not set"}
            sub={!displayName ? "Set on the webapp" : undefined}
          />
        </View>

        {/* Backup card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Encrypted backup</Text>
          <Text style={styles.helperText}>
            Save a passphrase-protected JSON file containing all your entries,
            debts, and profile. The same file imports back into the webapp's
            Settings → Backup & restore.
          </Text>
          <Pressable
            onPress={() => setExportOpen(true)}
            style={styles.actionBtn}
          >
            <Ionicons name="share-outline" size={18} color={colors.accent} />
            <Text style={styles.actionBtnText}>Export encrypted backup</Text>
          </Pressable>
        </View>

        {/* Security — biometric unlock (only when the device supports it) */}
        {bioSupport.available && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Security</Text>
            <View style={styles.bioRow}>
              <View style={styles.bioText}>
                <Text style={styles.bioLabel}>Unlock with {bioSupport.label}</Text>
                <Text style={styles.helperText}>
                  Skip typing your password on this device. Your key is stored in
                  the secure keychain and released only after a {bioSupport.label}{" "}
                  check. Turn off any time; signing out clears it.
                </Text>
              </View>
              <Switch
                value={bioEnabled}
                onValueChange={onToggleBiometric}
                trackColor={{ false: colors.border, true: colors.accent }}
                thumbColor={colors.textPrimary}
              />
            </View>
          </View>
        )}

        {/* App info */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>About</Text>
          <Row label="App" value="Qitlo Mobile · v0.1" />
          <Row label="Tax year" value="2025" />
          <Row label="Backend" value="Synced with the webapp" />
        </View>

        {/* Sign out */}
        <Pressable onPress={onSignOut} style={styles.dangerBtn}>
          <Ionicons name="log-out-outline" size={16} color={colors.error} />
          <Text style={styles.dangerBtnText}>Sign out</Text>
        </Pressable>

        <Text style={styles.footnote}>
          Account deletion and password change aren't supported yet. Both will
          ship in a later release.
        </Text>
      </ScrollView>

      {/* Export passphrase modal */}
      <Modal
        visible={exportOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setExportOpen(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => !exporting && setExportOpen(false)}
          />
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Encrypt your backup</Text>
            <Text style={styles.modalBody}>
              Pick a passphrase. You'll need it to decrypt the file later (when
              you import it on the webapp or another device).
              {"\n\n"}
              <Text style={{ color: colors.warningText }}>
                Lose the passphrase and the backup is unrecoverable.
              </Text>
            </Text>
            <TextInput
              value={exportPassphrase}
              onChangeText={setExportPassphrase}
              secureTextEntry
              autoCapitalize="none"
              placeholder="At least 8 characters"
              placeholderTextColor={colors.textPlaceholder}
              style={styles.input}
              autoFocus
            />
            <View style={styles.modalActions}>
              <Pressable
                onPress={() => {
                  setExportOpen(false);
                  setExportPassphrase("");
                }}
                disabled={exporting}
                style={styles.modalSecondary}
              >
                <Text style={styles.modalSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={doExport}
                disabled={exporting}
                style={[styles.modalPrimary, exporting && { opacity: 0.6 }]}
              >
                {exporting ? (
                  <ActivityIndicator color={colors.accentText} />
                ) : (
                  <Text style={styles.modalPrimaryText}>Encrypt &amp; share</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Components                                                           */
/* ------------------------------------------------------------------ */

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={{ flex: 1, alignItems: "flex-end" }}>
        <Text style={styles.rowValue}>{value}</Text>
        {sub ? <Text style={styles.rowSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl + 32 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: { minWidth: 64, paddingVertical: 4 },
  headerBtnText: { color: colors.accent, fontSize: 16 },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },

  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginTop: spacing.lg,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    gap: spacing.md,
  },
  rowLabel: { color: colors.textMuted, fontSize: 14 },
  rowValue: { color: colors.textPrimary, fontSize: 14, fontWeight: "500" },
  rowSub: { color: colors.textDim, fontSize: 11, marginTop: 2 },

  helperText: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginBottom: spacing.md },

  bioRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  bioText: { flex: 1 },
  bioLabel: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },

  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: radii.lg,
    backgroundColor: colors.successSurface,
    borderColor: colors.successBorder,
    borderWidth: 1,
  },
  actionBtnText: { color: colors.accent, fontSize: 14, fontWeight: "600" },

  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: spacing.xxl,
    paddingVertical: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.errorSurface,
    borderWidth: 1,
    borderColor: colors.errorBorder,
  },
  dangerBtnText: { color: colors.error, fontSize: 14, fontWeight: "500" },

  footnote: {
    color: colors.textDim,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.lg,
    lineHeight: 15,
  },

  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  modalCard: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    borderTopWidth: 1,
    borderColor: colors.border,
  },
  modalTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "700" },
  modalBody: { color: colors.textMuted, fontSize: 13, lineHeight: 19, marginTop: spacing.sm, marginBottom: spacing.md },
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
  modalActions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  modalSecondary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.lg,
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
  },
  modalSecondaryText: { color: colors.textMuted, fontSize: 15, fontWeight: "500" },
  modalPrimary: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radii.lg,
    alignItems: "center",
    backgroundColor: colors.accent,
  },
  modalPrimaryText: { color: colors.accentText, fontSize: 15, fontWeight: "700" },
});
