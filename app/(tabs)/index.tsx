/**
 * Dashboard — the primary tab.
 *
 * Surfaces the live tax estimate, the federal/SE display toggles (matching
 * the webapp's UX so a user toggling between platforms sees the same model),
 * the breakdown, a sync status pill, and the most recent entries.
 *
 * State source of truth is the AppState context. The display toggles are
 * intentionally LOCAL to this component — same as the webapp, where flipping
 * "Include SE tax" off is a comparison view, not a saved preference.
 *
 * The "Add sample entry" button is a placeholder for the real entry editor
 * (coming in the next slice). It exists so the sync round-trip is testable
 * end-to-end as soon as the screen loads.
 */

import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
  calculateTaxImpact,
  getStateConfig,
  evaluateSpendingLimits,
  limitAlertMessage,
  formatUsd,
  periodLabel,
  categoryLabel,
  buildSpendingNotifications,
  addNotifications,
  makeNotification,
  currentPeriodKey,
  type LimitStatus,
} from "qitlo-shared";

import { useAppState } from "../../src/lib/appState";
import { syncLimitNotifications } from "../../src/lib/notifications";
import { AppHeader } from "../../src/components/AppHeader";
import { colors, radii, spacing } from "../../src/lib/theme";

const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

export default function DashboardScreen() {
  const router = useRouter();
  const { user, blob, syncStatus, updateBlob } = useAppState();
  const [includeFederal, setIncludeFederal] = useState(true);
  const [includeSe, setIncludeSe] = useState(true);

  const data = blob?.data;
  const impact = useMemo(() => {
    if (!data) return null;
    return calculateTaxImpact(data.taxProfile, data.entries);
  }, [data]);

  // Evaluate this month's spend against the user's caps. Drives both the
  // in-app banner and (when enabled) the OS notification.
  const limitEval = useMemo(() => {
    if (!data) return null;
    return evaluateSpendingLimits(data.entries, data.spendingLimits);
  }, [data]);

  // Fire an OS notification when a category newly crosses its warn/limit
  // threshold. The notifications lib dedupes per (period, category) so this is
  // safe to run on every blob change; it no-ops when nothing escalated or when
  // notifications are disabled.
  useEffect(() => {
    if (!user || !data || !limitEval) return;
    const { spendingLimits } = data;

    // Record any new warn/over crossing into the synced inbox. Deterministic
    // ids mean this is idempotent — once logged (or cleared), it won't re-add,
    // so no write loop.
    const incoming = [...buildSpendingNotifications(limitEval)];

    // Backup reminder — mirrors the webapp's logic and uses the SAME id
    // (`backup:${period}`) so the synced merge dedupes to a single reminder
    // across devices. The backup schedule is owned by the webapp `user` object,
    // which we carry in passthrough; a pure-mobile user with no schedule set
    // (no user object / interval 0) simply gets no reminder. We suppress it
    // when desktop auto-backup is enabled, matching the web's intent.
    const pu = data.passthrough.user as
      | {
          backupReminder?: { intervalDays?: number };
          lastManualExportAt?: string;
          autoBackup?: { enabled?: boolean };
        }
      | undefined;
    const interval = pu?.backupReminder?.intervalDays ?? 0;
    if (interval > 0 && pu?.autoBackup?.enabled !== true) {
      const lastTs = pu?.lastManualExportAt ? Date.parse(pu.lastManualExportAt) : 0;
      const due = !lastTs || Date.now() - lastTs >= interval * 86_400_000;
      if (due) {
        const daysSince = lastTs
          ? Math.floor((Date.now() - lastTs) / 86_400_000)
          : null;
        incoming.push(
          makeNotification(
            `backup:${currentPeriodKey()}`,
            "backupReminder",
            "Back up your tax data",
            daysSince === null
              ? "You haven't exported a backup yet — your data is at risk if you lose this device."
              : `Last backup ${daysSince} day${daysSince === 1 ? "" : "s"} ago. Time for a fresh one.`,
          ),
        );
      }
    }

    const { list, added } = addNotifications(data.notifications, incoming);
    if (added > 0) {
      void updateBlob({ ...data, notifications: list });
    }

    // Device-local OS push (its own dedupe), only when the user opted in.
    syncLimitNotifications({
      userId: user.id,
      periodKey: limitEval.periodKey,
      enabled: spendingLimits.notificationsEnabled,
      personal: {
        level: limitEval.personal.level,
        title: "Personal spending alert",
        body: limitAlertMessage(limitEval.personal, limitEval.periodKey) ?? "",
      },
      business: {
        level: limitEval.business.level,
        title: "Business spending alert",
        body: limitAlertMessage(limitEval.business, limitEval.periodKey) ?? "",
      },
    });
  }, [user, data, limitEval, updateBlob]);

  if (!data || !impact || !user) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} />
          <Text style={styles.dim}>Loading…</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Apply display toggles. These don't change the underlying math — they
  // just remove rows from the displayed total, matching the webapp's
  // "comparison view" semantics.
  const displayedTotal =
    impact.totalTax -
    (includeFederal ? 0 : impact.federalTax) -
    (includeSe ? 0 : impact.seTax);
  const displayedQuarterly = displayedTotal / 4;
  const effectiveRate = impact.grossIncome > 0 ? displayedTotal / impact.grossIncome : 0;

  const config = getStateConfig(data.taxProfile.state);
  const filingLabel = filingStatusLabel(data.taxProfile.filingStatus);
  const recent = data.entries.slice(-5).reverse();

  function openEntryEditor() {
    router.push("/entry");
  }

  function openJournal() {
    router.push("/journal");
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      {/* Top bar: logo left, avatar menu right */}
      <AppHeader />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.eyebrow}>Estimated reserve</Text>
            <Text style={styles.bigNumber}>{fmt(displayedTotal)}</Text>
            <Text style={styles.subtitle}>
              {fmt(displayedQuarterly)} per quarter · {fmtPct(effectiveRate)} effective
              {!includeFederal && " · excl. federal"}
              {!includeSe && " · excl. SE"}
            </Text>
          </View>
        </View>

        {/* Sync pill */}
        <SyncPill status={syncStatus} />

        {/* Spending limits */}
        {limitEval && (
          <SpendingLimitsCard
            personal={limitEval.personal}
            business={limitEval.business}
            periodKey={limitEval.periodKey}
            onEdit={() => router.push("/limits")}
          />
        )}

        {/* Profile summary */}
        <Pressable onPress={() => router.push("/profile")} style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Tax profile</Text>
            <View style={styles.editIndicator}>
              <Text style={styles.editIndicatorText}>Edit</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
            </View>
          </View>
          <Row label="State" value={`${config.name} (${config.code})`} />
          <Row label="Filing status" value={filingLabel} />
          {data.taxProfile.locality && (
            <Row
              label="Locality"
              value={
                config.localities.find((l) => l.id === data.taxProfile.locality)?.label ??
                data.taxProfile.locality
              }
            />
          )}
          <Row label="Dependents" value={String(data.taxProfile.dependents)} />
          <Row label="Tax year" value={String(data.taxProfile.taxYear)} />
        </Pressable>

        {/* Federal / SE toggles */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Display toggles</Text>
          <ToggleRow
            label="Include federal income tax"
            sublabel={`+${fmt(impact.federalTax)}`}
            value={includeFederal}
            onChange={setIncludeFederal}
          />
          <ToggleRow
            label="Include SE tax (15.3% FICA)"
            sublabel={`+${fmt(impact.seTax)}`}
            value={includeSe}
            onChange={setIncludeSe}
          />
          <Text style={styles.helperText}>
            Toggles affect the headline only — the underlying math always runs.
            Useful for comparing W-2-only vs self-employed scenarios.
          </Text>
        </View>

        {/* Breakdown */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Breakdown</Text>
          <Row label="Gross income" value={fmt(impact.grossIncome)} />
          <Row label="Business expenses" value={`−${fmt(impact.deductibleExpenses)}`} />
          <Row label="Adjusted" value={fmt(impact.adjustedIncome)} />
          <View style={styles.divider} />
          {includeFederal && (
            <Row label="Federal income tax" value={fmt(impact.federalTax)} />
          )}
          {includeSe && (
            <Row label="Self-employment tax" value={fmt(impact.seTax)} />
          )}
          <Row label={impact.stateTaxLabel} value={fmt(impact.stateTax)} />
          {impact.localityTaxLabel ? (
            <Row label={impact.localityTaxLabel} value={fmt(impact.localityTax)} />
          ) : null}
          <View style={styles.divider} />
          <Row label="Total estimated tax" value={fmt(displayedTotal)} emphasis />
          <Row label="Quarterly set-aside" value={fmt(displayedQuarterly)} />
        </View>

        {/* Recent entries */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Text style={styles.cardTitle}>Recent entries</Text>
            <Pressable onPress={openJournal} hitSlop={8}>
              <Text style={styles.link}>See all ({data.entries.length})</Text>
            </Pressable>
          </View>
          {recent.length === 0 ? (
            <Text style={styles.helperText}>
              No entries yet. Tap "Add entry" below to log your first income or
              expense — the live estimate updates instantly and syncs to the
              cloud.
            </Text>
          ) : (
            recent.map((e) => (
              <Pressable
                key={e.id}
                onPress={() => router.push({ pathname: "/entry", params: { id: e.id } })}
                style={styles.entryRow}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.entryLabel}>{e.label}</Text>
                  <Text style={styles.entryMeta}>
                    {e.date} · {treatmentLabel(e.taxTreatment)}
                  </Text>
                </View>
                <Text
                  style={[
                    styles.entryValue,
                    e.taxTreatment === "income"
                      ? styles.entryValueIncome
                      : styles.entryValueExpense,
                  ]}
                >
                  {e.taxTreatment === "income" ? "+" : "−"}
                  {fmt(e.amount)}
                </Text>
              </Pressable>
            ))
          )}
        </View>

        <Pressable onPress={openEntryEditor} style={styles.primaryBtn}>
          <Ionicons name="add" size={18} color={colors.accentText} />
          <Text style={styles.primaryBtnText}>Add entry</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Small components                                                     */
/* ------------------------------------------------------------------ */

type RowProps = { label: string; value: string; emphasis?: boolean };
const Row = ({ label, value, emphasis }: RowProps) => (
  <View style={styles.row}>
    <Text style={[styles.rowLabel, emphasis && styles.rowLabelEmphasis]}>{label}</Text>
    <Text style={[styles.rowValue, emphasis && styles.rowValueEmphasis]}>{value}</Text>
  </View>
);

/** Monthly spending caps card with per-category meters and inline alerts.
 *  Tapping anywhere opens the limits editor. */
function SpendingLimitsCard({
  personal,
  business,
  periodKey,
  onEdit,
}: {
  personal: LimitStatus;
  business: LimitStatus;
  periodKey: string;
  onEdit: () => void;
}) {
  const hasAny = personal.limit != null || business.limit != null;
  // Worst level across categories tints the card border.
  const worst: LimitStatus["level"] =
    personal.level === "over" || business.level === "over"
      ? "over"
      : personal.level === "warn" || business.level === "warn"
        ? "warn"
        : "ok";

  return (
    <Pressable
      onPress={onEdit}
      style={[
        styles.card,
        worst === "warn" && styles.cardWarn,
        worst === "over" && styles.cardOver,
      ]}
    >
      <View style={styles.cardHead}>
        <Text style={styles.cardTitle}>Spending limits</Text>
        <View style={styles.editIndicator}>
          <Text style={styles.editIndicatorText}>{hasAny ? "Edit" : "Set"}</Text>
          <Ionicons name="chevron-forward" size={14} color={colors.textMuted} />
        </View>
      </View>

      {!hasAny ? (
        <Text style={styles.helperText}>
          Set a monthly cap for personal or business spending and we&apos;ll warn
          you as you approach it.
        </Text>
      ) : (
        <>
          <Text style={styles.periodLabel}>{periodLabel(periodKey)}</Text>
          {personal.limit != null && <LimitMeter status={personal} />}
          {business.limit != null && <LimitMeter status={business} />}
        </>
      )}
    </Pressable>
  );
}

/** One category meter: label, spent/limit, percent, colored progress bar, and
 *  an inline alert line when warn/over. */
function LimitMeter({ status }: { status: LimitStatus }) {
  const limit = status.limit as number;
  const barColor =
    status.level === "over"
      ? colors.error
      : status.level === "warn"
        ? colors.warningText
        : colors.accent;
  const alert = limitAlertMessage(status, undefined);

  return (
    <View style={styles.meterBlock}>
      <View style={styles.meterTop}>
        <Text style={styles.meterLabel}>{categoryLabel(status.category)}</Text>
        <Text style={styles.meterValue}>
          {formatUsd(status.spent)} / {formatUsd(limit)} · {status.percent}%
        </Text>
      </View>
      <View style={styles.meterTrack}>
        <View
          style={[
            styles.meterFill,
            {
              width: `${Math.min(100, Math.max(0, status.percent ?? 0))}%`,
              backgroundColor: barColor,
            },
          ]}
        />
      </View>
      {status.level !== "ok" && alert && (
        <Text
          style={[
            styles.meterAlert,
            { color: status.level === "over" ? colors.error : colors.warningText },
          ]}
        >
          {alert}
        </Text>
      )}
    </View>
  );
}

function ToggleRow({
  label,
  sublabel,
  value,
  onChange,
}: {
  label: string;
  sublabel: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.toggleLabel}>{label}</Text>
        <Text style={styles.toggleSub}>{sublabel}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.surfaceElevated, true: colors.accent }}
        thumbColor={value ? colors.accentText : colors.textMuted}
      />
    </View>
  );
}

function SyncPill({ status }: { status: ReturnType<typeof useAppState>["syncStatus"] }) {
  const { tone, text, icon } = describeStatus(status);
  return (
    <View style={[styles.pill, tone === "warn" && styles.pillWarn, tone === "ok" && styles.pillOk]}>
      <Ionicons
        name={icon}
        size={14}
        color={tone === "warn" ? colors.warningText : colors.accent}
      />
      <Text style={[styles.pillText, tone === "warn" && { color: colors.warningText }]}>
        {text}
      </Text>
    </View>
  );
}

function describeStatus(s: ReturnType<typeof useAppState>["syncStatus"]): {
  tone: "ok" | "warn" | "muted";
  text: string;
  icon: keyof typeof Ionicons.glyphMap;
} {
  switch (s.kind) {
    case "syncing":
      return { tone: "muted", text: "Syncing…", icon: "sync-outline" };
    case "synced":
      return { tone: "ok", text: `Synced · v${s.version}`, icon: "checkmark-circle-outline" };
    case "offline":
      return { tone: "warn", text: `Offline · ${s.message}`, icon: "cloud-offline-outline" };
    case "conflict":
      return { tone: "warn", text: "Conflict — pulled latest", icon: "alert-circle-outline" };
    case "error":
      return { tone: "warn", text: `Error · ${s.message}`, icon: "warning-outline" };
    case "idle":
    default:
      return { tone: "muted", text: "Idle", icon: "ellipse-outline" };
  }
}

function filingStatusLabel(s: string): string {
  switch (s) {
    case "single": return "Single";
    case "marriedJoint": return "Married filing jointly";
    case "marriedSeparate": return "Married filing separately";
    case "headOfHousehold": return "Head of household";
    default: return s;
  }
}

function treatmentLabel(t: string): string {
  switch (t) {
    case "income": return "Income";
    case "businessExpense": return "Business expense";
    case "personalExpense": return "Personal expense";
    default: return t;
  }
}

/* ------------------------------------------------------------------ */
/* Styles                                                               */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  // flex:1 bounds the scroll area to the space below the pinned header, so
  // content scrolls beneath the bar instead of behind it.
  scrollView: { flex: 1 },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl + 32 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  dim: { color: colors.textMuted, fontSize: 13 },

  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  link: { color: colors.accent, fontSize: 13, fontWeight: "500" },
  editIndicator: { flexDirection: "row", alignItems: "center", gap: 2 },
  editIndicatorText: { color: colors.textMuted, fontSize: 12 },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  bigNumber: {
    color: colors.textPrimary,
    fontSize: 40,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    letterSpacing: -1,
  },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 4 },

  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.md,
  },
  pillOk: { backgroundColor: colors.successSurface, borderColor: colors.successBorder },
  pillWarn: { backgroundColor: colors.warningSurface, borderColor: colors.warningBorder },
  pillText: { color: colors.textSecondary, fontSize: 12, fontWeight: "500" },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardWarn: { backgroundColor: colors.warningSurface, borderColor: colors.warningBorder },
  cardOver: { backgroundColor: colors.errorSurface, borderColor: colors.errorBorder },
  cardHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },

  periodLabel: {
    color: colors.textMuted,
    fontSize: 12,
    marginBottom: spacing.sm,
  },
  meterBlock: { marginTop: spacing.md },
  meterTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 6,
  },
  meterLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: "500" },
  meterValue: { color: colors.textMuted, fontSize: 13, fontVariant: ["tabular-nums"] },
  meterTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surfaceElevated,
    overflow: "hidden",
  },
  meterFill: { height: 8, borderRadius: 4 },
  meterAlert: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
    marginBottom: spacing.sm,
  },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    paddingVertical: 8,
  },
  rowLabel: { color: colors.textMuted, fontSize: 14 },
  rowValue: { color: colors.textSecondary, fontSize: 14, fontVariant: ["tabular-nums"] },
  rowLabelEmphasis: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  rowValueEmphasis: { color: colors.accent, fontSize: 18, fontWeight: "700" },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: 4 },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: spacing.md,
  },
  toggleLabel: { color: colors.textPrimary, fontSize: 14, fontWeight: "500" },
  toggleSub: { color: colors.textMuted, fontSize: 12, marginTop: 2, fontVariant: ["tabular-nums"] },

  helperText: { color: colors.textDim, fontSize: 12, marginTop: spacing.md, lineHeight: 18 },

  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  entryLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: "500" },
  entryMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  entryValue: { fontSize: 14, fontWeight: "600", fontVariant: ["tabular-nums"] },
  entryValueIncome: { color: colors.accent },
  entryValueExpense: { color: colors.textSecondary },

  primaryBtn: {
    flexDirection: "row",
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.xl,
  },
  primaryBtnText: { color: colors.accentText, fontSize: 16, fontWeight: "700" },
  footnote: { color: colors.textDim, fontSize: 11, textAlign: "center", marginTop: spacing.md },
});
