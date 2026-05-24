/**
 * Report tab — the mobile adaptation of the webapp's printable report.
 *
 * A read-only "tax-aware financial summary": headline metrics (gross income,
 * estimated tax, business deductions), a generated plain-English explanation,
 * and the full journal ledger with running balances. Mirrors the web Report
 * page so the two platforms tell the same story.
 *
 * The web offers "Print Report"; the mobile analog is a native Share action
 * that hands a plain-text summary to the OS share sheet (Notes, Mail, etc.).
 *
 * Pure read view — derives everything from calculateTaxImpact() + the synced
 * blob. No writes, no sync.
 */

import { useMemo, type ReactNode } from "react";
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import {
  calculateTaxImpact,
  classifyDebtImpact,
  type JournalEntry,
} from "qitlo-shared";

import { useAppState } from "../../src/lib/appState";
import { AppHeader } from "../../src/components/AppHeader";
import { colors, radii, spacing } from "../../src/lib/theme";

const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;

function treatmentLabel(t: JournalEntry["taxTreatment"]): string {
  if (t === "businessExpense") return "Business";
  if (t === "personalExpense") return "Personal";
  return "Income";
}

function treatmentColor(t: JournalEntry["taxTreatment"]): string {
  if (t === "income") return colors.accent;
  if (t === "businessExpense") return colors.warningText;
  return colors.textMuted;
}

export default function ReportScreen() {
  const { blob } = useAppState();
  const data = blob?.data;

  const impact = useMemo(
    () => (data ? calculateTaxImpact(data.taxProfile, data.entries) : null),
    [data],
  );

  // Oldest → newest, so the running balance reads top-to-bottom like a ledger.
  const sorted = useMemo(() => {
    const entries = data?.entries ?? [];
    return [...entries].sort((a, b) =>
      a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
    );
  }, [data]);

  // Running balance: income adds, any expense subtracts. Mirrors the web.
  const balances = useMemo(() => {
    let balance = 0;
    const map = new Map<string, number>();
    for (const e of sorted) {
      balance += e.taxTreatment === "income" ? e.amount : -e.amount;
      map.set(e.id, balance);
    }
    return map;
  }, [sorted]);

  // Debt interest that *might* matter for tax (everything except clearly-personal).
  const potentialDebtImpact = useMemo(() => {
    let total = 0;
    for (const d of data?.debtEntries ?? []) {
      if (classifyDebtImpact(d).tone !== "impactNone") total += d.interestPaid;
    }
    return total;
  }, [data]);

  if (!impact) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <AppHeader />
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>Report</Text>
            <Text style={styles.title}>Tax-aware financial summary</Text>
          </View>
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyBody}>
            Unlock your data to see your financial summary.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const effectiveRate = impact.grossIncome > 0 ? impact.totalTax / impact.grossIncome : 0;
  const deductionRate =
    impact.grossIncome > 0 ? impact.deductibleExpenses / impact.grossIncome : 0;

  async function onShare() {
    if (!impact) return;
    const lines: string[] = [
      "Qitlo — Tax-aware financial summary",
      "",
      `Gross income: ${fmt(impact.grossIncome)}`,
      `Estimated tax: ${fmt(impact.totalTax)} (${fmtPct(effectiveRate)} effective)`,
      `Business deductions: ${fmt(impact.deductibleExpenses)}`,
      "",
      `Recorded ${fmt(impact.grossIncome)} in gross income and ${fmt(impact.deductibleExpenses)} in business deductions. Estimated reserve is ${fmt(impact.totalTax)}, roughly ${fmtPct(effectiveRate)} of gross income. Personal spending is shown for awareness and does not reduce the estimate.`,
    ];
    if (potentialDebtImpact > 0) {
      lines.push(
        `Debt interest marked as possible impact totals ${fmt(potentialDebtImpact)}.`,
      );
    }
    if (sorted.length > 0) {
      lines.push("", "Journal ledger:");
      for (const e of sorted) {
        lines.push(
          `${e.date} · ${e.label} · ${treatmentLabel(e.taxTreatment)} · ${fmt(e.amount)} · bal ${fmt(balances.get(e.id) ?? 0)}`,
        );
      }
    }
    lines.push("", "Qitlo is a planning aid, not tax advice.");
    try {
      await Share.share({ message: lines.join("\n") });
    } catch {
      // User dismissed the share sheet — nothing to do.
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.eyebrow}>Report</Text>
            <Text style={styles.title}>Tax-aware financial summary</Text>
          </View>
          <Pressable
            onPress={onShare}
            style={({ pressed }) => [styles.shareBtn, pressed && styles.shareBtnPressed]}
            accessibilityRole="button"
            accessibilityLabel="Share report"
          >
            <Ionicons name="share-outline" size={16} color={colors.accentText} />
            <Text style={styles.shareBtnText}>Share</Text>
          </Pressable>
        </View>

        <View style={styles.metrics}>
          <MetricCard label="Gross income" value={fmt(impact.grossIncome)} sub="Tracked manually" />
          <MetricCard
            label="Estimated tax"
            value={fmt(impact.totalTax)}
            sub={`${fmtPct(effectiveRate)} effective`}
            tone="accent"
          />
          <MetricCard
            label="Business deductions"
            value={fmt(impact.deductibleExpenses)}
            sub={`${fmtPct(deductionRate)} of income`}
          />
        </View>

        <Card eyebrow="Generated explanation" title="What this report means">
          <Text style={styles.bodyText}>
            Based on the current entries, you have recorded{" "}
            <Text style={styles.bodyStrong}>{fmt(impact.grossIncome)}</Text> in gross
            income and <Text style={styles.bodyStrong}>{fmt(impact.deductibleExpenses)}</Text>{" "}
            in business deductions. The estimated reserve is{" "}
            <Text style={styles.bodyStrong}>{fmt(impact.totalTax)}</Text>, or roughly{" "}
            {fmtPct(effectiveRate)} of gross income. Personal spending is shown for
            awareness and does not reduce the tax estimate.
          </Text>
          <Text style={styles.bodyText}>
            Debt records are reviewed separately because loans generally do not
            affect personal income tax unless the interest is tied to business,
            student, mortgage, or investment activity.
            {potentialDebtImpact > 0 ? (
              <>
                {" "}Current debt interest marked as possible impact totals{" "}
                <Text style={styles.bodyStrong}>{fmt(potentialDebtImpact)}</Text>.
              </>
            ) : null}
          </Text>
        </Card>

        <Card eyebrow="Entry summary" title="Journal ledger">
          {sorted.length === 0 ? (
            <Text style={styles.bodyText}>
              No journal entries yet. Add income and expenses to build your ledger.
            </Text>
          ) : (
            <View>
              <View style={styles.ledgerHead}>
                <Text style={[styles.ledgerHeadCell, styles.colEntry]}>Entry</Text>
                <Text style={[styles.ledgerHeadCell, styles.colAmount]}>Amount</Text>
                <Text style={[styles.ledgerHeadCell, styles.colBalance]}>Balance</Text>
              </View>
              {sorted.map((e) => (
                <LedgerRow key={e.id} entry={e} balance={balances.get(e.id) ?? 0} />
              ))}
            </View>
          )}
        </Card>

        <Text style={styles.disclaimer}>
          Qitlo is a planning aid, not tax advice. Confirm figures with a qualified
          professional before filing.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                      */
/* ------------------------------------------------------------------ */

function MetricCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "accent";
}) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, tone === "accent" && styles.metricValueAccent]}>
        {value}
      </Text>
      <Text style={styles.metricSub}>{sub}</Text>
    </View>
  );
}

function Card({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardEyebrow}>{eyebrow}</Text>
      <Text style={styles.cardTitle}>{title}</Text>
      <View style={styles.cardBody}>{children}</View>
    </View>
  );
}

function LedgerRow({ entry, balance }: { entry: JournalEntry; balance: number }) {
  const sign = entry.taxTreatment === "income" ? "+" : "−";
  return (
    <View style={styles.ledgerRow}>
      <View style={styles.colEntry}>
        <Text style={styles.ledgerLabel} numberOfLines={1}>
          {entry.label}
        </Text>
        <Text style={styles.ledgerMeta} numberOfLines={1}>
          {entry.date} ·{" "}
          <Text style={{ color: treatmentColor(entry.taxTreatment) }}>
            {treatmentLabel(entry.taxTreatment)}
          </Text>
          {entry.journalNote || entry.category ? ` · ${entry.journalNote || entry.category}` : ""}
        </Text>
      </View>
      <Text style={[styles.colAmount, styles.ledgerAmount]}>
        {sign}
        {fmt(entry.amount)}
      </Text>
      <Text
        style={[
          styles.colBalance,
          styles.ledgerBalance,
          balance < 0 && styles.ledgerBalanceNeg,
        ]}
      >
        {fmt(balance)}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing.xxl + 32 },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: 4,
  },
  headerText: { flex: 1 },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: "700" },

  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
    marginTop: 2,
  },
  shareBtnPressed: { opacity: 0.85 },
  shareBtnText: { color: colors.accentText, fontSize: 14, fontWeight: "700" },

  metrics: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  metricCard: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  metricValue: {
    color: colors.textPrimary,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 4,
    fontVariant: ["tabular-nums"],
  },
  metricValueAccent: { color: colors.accent },
  metricSub: { color: colors.textDim, fontSize: 10, marginTop: 3 },

  card: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardEyebrow: {
    color: colors.accent,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  cardTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "700" },
  cardBody: { marginTop: spacing.md, gap: spacing.md },

  bodyText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  bodyStrong: { color: colors.textPrimary, fontWeight: "700" },

  ledgerHead: {
    flexDirection: "row",
    alignItems: "center",
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  ledgerHeadCell: {
    color: colors.textDim,
    fontSize: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  colEntry: { flex: 1 },
  colAmount: { width: 84, textAlign: "right" },
  colBalance: { width: 84, textAlign: "right" },

  ledgerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  ledgerLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  ledgerMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  ledgerAmount: {
    color: colors.textSecondary,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  ledgerBalance: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  ledgerBalanceNeg: { color: colors.error },

  disclaimer: {
    color: colors.textDim,
    fontSize: 11,
    lineHeight: 16,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
  },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },
});
