/**
 * Spending limits editor — modal route at /limits.
 *
 * Lets the user set a monthly cap for Personal and/or Business spending, see
 * how much they've spent so far this month against each cap, and opt into OS
 * notifications. Caps are stored on the synced blob (AppBlob.spendingLimits),
 * so they show up on the webapp too.
 *
 * Leaving a cap field blank means "no limit" for that category.
 */

import { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
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

import {
  DEFAULT_SPENDING_LIMITS,
  evaluateSpendingLimits,
  formatUsd,
  periodLabel,
  type LimitStatus,
} from "qitlo-shared";
import { useAppState, type AppBlob } from "../src/lib/appState";
import {
  getNotificationPermission,
  requestNotificationPermission,
} from "../src/lib/notifications";
import { colors, radii, spacing } from "../src/lib/theme";

/** "1200" → 1200, "" / "0" / junk → null (no limit). */
function parseCap(text: string): number | null {
  const cleaned = text.replace(/[^0-9.]/g, "");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export default function LimitsScreen() {
  const router = useRouter();
  const { blob, updateBlob } = useAppState();

  const current = blob?.data.spendingLimits ?? DEFAULT_SPENDING_LIMITS;

  const [personal, setPersonal] = useState<string>(
    current.personal != null ? String(current.personal) : "",
  );
  const [business, setBusiness] = useState<string>(
    current.business != null ? String(current.business) : "",
  );
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(
    current.notificationsEnabled,
  );
  const [busy, setBusy] = useState(false);

  // Live preview: what would the banner say with the caps being typed?
  const preview = useMemo(() => {
    const entries = blob?.data.entries ?? [];
    return evaluateSpendingLimits(entries, {
      personal: parseCap(personal),
      business: parseCap(business),
      warnAtPercent: current.warnAtPercent || DEFAULT_SPENDING_LIMITS.warnAtPercent,
      notificationsEnabled,
    });
  }, [blob, personal, business, notificationsEnabled, current.warnAtPercent]);

  async function onToggleNotifications(next: boolean) {
    if (!next) {
      setNotificationsEnabled(false);
      return;
    }
    // Turning on — make sure we actually have OS permission.
    const granted =
      (await getNotificationPermission()) ||
      (await requestNotificationPermission());
    if (granted) {
      setNotificationsEnabled(true);
    } else {
      setNotificationsEnabled(false);
      Alert.alert(
        "Notifications are off",
        "To get alerts on your phone, allow notifications for Qitlo in your device Settings. The in-app banner will still warn you.",
      );
    }
  }

  async function onSave() {
    if (!blob) {
      Alert.alert("Not ready", "Still loading — try again in a moment.");
      return;
    }
    setBusy(true);
    const next: AppBlob = {
      ...blob.data,
      spendingLimits: {
        personal: parseCap(personal),
        business: parseCap(business),
        warnAtPercent: current.warnAtPercent || DEFAULT_SPENDING_LIMITS.warnAtPercent,
        notificationsEnabled,
      },
    };
    await updateBlob(next);
    setBusy(false);
    router.back();
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBtn} disabled={busy}>
            <Text style={styles.headerBtnText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Spending limits</Text>
          <Pressable onPress={onSave} hitSlop={12} style={styles.headerBtn} disabled={busy}>
            <Text style={[styles.headerBtnText, styles.headerBtnPrimary, busy && styles.headerBtnDisabled]}>
              {busy ? "Saving…" : "Save"}
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Text style={styles.intro}>
            Set a monthly budget for personal and business spending. We&apos;ll warn
            you at {current.warnAtPercent || DEFAULT_SPENDING_LIMITS.warnAtPercent}% and
            again when you reach a limit. Tracking {periodLabel(preview.periodKey)}.
          </Text>

          <CapField
            label="Personal monthly limit"
            value={personal}
            onChangeText={setPersonal}
            status={preview.personal}
            placeholder="No limit"
          />
          <CapField
            label="Business monthly limit"
            value={business}
            onChangeText={setBusiness}
            status={preview.business}
            placeholder="No limit"
          />

          <View style={styles.toggleRow}>
            <View style={styles.flex1}>
              <Text style={styles.toggleLabel}>Phone notifications</Text>
              <Text style={styles.toggleHelp}>
                Get an alert on your phone when you approach or reach a limit. The
                in-app banner shows either way.
              </Text>
            </View>
            <Switch
              value={notificationsEnabled}
              onValueChange={onToggleNotifications}
              trackColor={{ true: colors.accent, false: colors.border }}
              thumbColor="#ffffff"
              ios_backgroundColor={colors.border}
            />
          </View>

          <Text style={styles.footnote}>
            Limits sync with the web app. Leave a field blank to turn that limit off.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** One cap input with a live "spent so far" line that recolors by level. */
function CapField({
  label,
  value,
  onChangeText,
  status,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  status: LimitStatus;
  placeholder: string;
}) {
  const hasLimit = status.limit != null;
  const tone =
    status.level === "over"
      ? styles.toneOver
      : status.level === "warn"
        ? styles.toneWarn
        : styles.toneOk;

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <Text style={styles.currency}>$</Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          placeholder={placeholder}
          placeholderTextColor={colors.textPlaceholder}
          style={styles.input}
        />
      </View>
      <Text style={[styles.spentLine, tone]}>
        {formatUsd(status.spent)} spent this month
        {hasLimit
          ? ` · ${status.percent}% of ${formatUsd(status.limit as number)}`
          : ""}
      </Text>
      {hasLimit && (
        <View style={styles.meterTrack}>
          <View
            style={[
              styles.meterFill,
              {
                width: `${Math.min(100, Math.max(0, status.percent ?? 0))}%`,
                backgroundColor:
                  status.level === "over"
                    ? colors.error
                    : status.level === "warn"
                      ? colors.warningText
                      : colors.accent,
              },
            ]}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex1: { flex: 1 },
  scroll: { padding: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxl + 32 },

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
  headerBtnText: { color: colors.textMuted, fontSize: 16 },
  headerBtnPrimary: { color: colors.accent, fontWeight: "600", textAlign: "right" },
  headerBtnDisabled: { opacity: 0.5 },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },

  intro: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: spacing.sm },

  field: { marginTop: spacing.xl },
  label: {
    color: colors.textMuted,
    fontSize: 12,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
  },
  currency: { color: colors.textMuted, fontSize: 20, fontWeight: "600", marginRight: 6 },
  input: {
    flex: 1,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 22,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  spentLine: { marginTop: 8, fontSize: 13, fontVariant: ["tabular-nums"] },
  toneOk: { color: colors.textMuted },
  toneWarn: { color: colors.warningText },
  toneOver: { color: colors.error },

  meterTrack: {
    marginTop: 8,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surfaceElevated,
    overflow: "hidden",
  },
  meterFill: { height: 6, borderRadius: 3 },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    marginTop: spacing.xxl,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  toggleLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  toggleHelp: { color: colors.textMuted, fontSize: 12, lineHeight: 17, marginTop: 3 },

  footnote: { color: colors.textDim, fontSize: 12, lineHeight: 18, marginTop: spacing.xl },
});
