/**
 * Tax Rules tab — the mobile adaptation of the webapp's RulesPage.
 *
 * Renders dynamically from whichever StateTaxConfig is active for the user's
 * tax profile (state + filing status), mirroring the web screen: an intro +
 * planning caveat, the calculation order, the deductions applied, locality
 * treatment, the headline rate, the per-filing-status bracket table, and the
 * "what is not yet modeled" caveats.
 *
 * Pure read-only view — it derives everything from getStateConfig() and the
 * synced taxProfile, so it stays byte-for-byte in step with the web app and the
 * shared tax engine. No writes, no sync.
 */

import { useMemo, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  getStateConfig,
  normalizeTaxProfile,
  type Bracket,
  type FilingStatus,
  type StateTaxConfig,
} from "qitlo-shared";

import { useAppState } from "../../src/lib/appState";
import { AppHeader } from "../../src/components/AppHeader";
import { colors, radii, spacing } from "../../src/lib/theme";

const dollarFmt0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

const filingStatusLabels: Record<FilingStatus, string> = {
  single: "Single",
  marriedJoint: "Married filing jointly",
  marriedSeparate: "Married filing separately",
  headOfHousehold: "Head of household",
};

const FILING_STATUSES: FilingStatus[] = [
  "single",
  "marriedJoint",
  "marriedSeparate",
  "headOfHousehold",
];

/** Format a bracket array as rows like ["$0–$8,500", "4.00%"]. Mirrors web. */
function bracketsToRows(brackets: Bracket[]): string[][] {
  if (brackets.length === 0) return [];
  const rows: string[][] = [];
  let prevTop = 0;
  for (let i = 0; i < brackets.length; i++) {
    const b = brackets[i];
    const ratePct = `${(b.rate * 100).toFixed(2)}%`;
    if (b.upTo === undefined) {
      rows.push([`Over $${dollarFmt0.format(prevTop)}`, ratePct]);
    } else {
      rows.push([
        `$${dollarFmt0.format(prevTop)}–$${dollarFmt0.format(b.upTo)}`,
        ratePct,
      ]);
      prevTop = b.upTo;
    }
  }
  return rows;
}

function headlineRate(config: StateTaxConfig): string {
  if (!config.hasIncomeTax) return "No state income tax";
  const all = Object.values(config.brackets).flat();
  if (all.length === 0) return "—";
  const min = Math.min(...all.map((b) => b.rate));
  const max = Math.max(...all.map((b) => b.rate));
  if (config.taxStyle === "flat") return `${(max * 100).toFixed(2)}% flat`;
  return `${(min * 100).toFixed(2)}% – ${(max * 100).toFixed(2)}% (progressive)`;
}

export default function RulesScreen() {
  const { blob } = useAppState();
  const data = blob?.data;

  const resolved = useMemo(() => {
    if (!data) return null;
    const profile = normalizeTaxProfile(data.taxProfile);
    return { config: getStateConfig(profile.state), filingStatus: profile.filingStatus };
  }, [data]);

  if (!resolved) {
    return (
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <AppHeader />
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Tax Rules</Text>
          <Text style={styles.title}>Tax Rules</Text>
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyBody}>
            Unlock your data to see the calculation rules for your state.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const { config, filingStatus } = resolved;

  const steps: string[] = [
    "Add all Income entries to gross income.",
    "Subtract Business entries as possible business deductions.",
    "Ignore Personal entries for tax reduction; they remain cash-flow notes only.",
    `Subtract the ${config.name} standard deduction by filing status.`,
  ];
  if (config.personalExemption > 0) {
    steps.push(
      `Subtract personal exemption ($${dollarFmt0.format(config.personalExemption)} per filer).`,
    );
  }
  if (config.dependentExemption > 0) {
    steps.push(
      `Subtract dependent exemption at $${dollarFmt0.format(config.dependentExemption)} per dependent.`,
    );
  }
  steps.push(
    `Apply ${config.name} ${config.taxStyle === "flat" ? "flat rate" : "progressive brackets"} to taxable income.`,
  );
  if (config.localities.length > 0) {
    steps.push(
      `Add the resident locality tax if a locality is selected (${config.localities.length} option${config.localities.length === 1 ? "" : "s"} for ${config.name}).`,
    );
  }

  const bracketRows = config.hasIncomeTax
    ? bracketsToRows(config.brackets[filingStatus])
    : [];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <Text style={styles.eyebrow}>Tax Rules</Text>
          <Text style={styles.title}>{config.name}</Text>
          <Text style={styles.subtitle}>Calculation rules deployed in this MVP</Text>
        </View>

        <View style={styles.note}>
          <Text style={styles.noteText}>
            {config.notes} Estimates use 2025 published rates and are for planning
            only — verify with your state&apos;s tax authority before relying on
            numbers for filing or estimated payments.
          </Text>
        </View>

        <Card eyebrow="Calculation order" title="How the estimate is built">
          {steps.map((s, i) => (
            <View key={i} style={styles.step}>
              <View style={styles.stepNum}>
                <Text style={styles.stepNumText}>{i + 1}</Text>
              </View>
              <Text style={styles.stepText}>{s}</Text>
            </View>
          ))}
        </Card>

        <Card eyebrow="Deductions" title={`${config.name} deductions applied`}>
          {FILING_STATUSES.map((fs) => (
            <RuleRow
              key={fs}
              label={filingStatusLabels[fs]}
              value={`$${dollarFmt0.format(config.standardDeduction[fs])} standard deduction`}
            />
          ))}
          {config.personalExemption > 0 ? (
            <RuleRow
              label="Personal exemption"
              value={`$${dollarFmt0.format(config.personalExemption)} per filer`}
            />
          ) : null}
          {config.dependentExemption > 0 ? (
            <RuleRow
              label="Dependent exemption"
              value={`$${dollarFmt0.format(config.dependentExemption)} per dependent`}
            />
          ) : null}
        </Card>

        <Card eyebrow="Locality" title="Local tax treatment">
          {config.localities.length === 0 ? (
            <RuleRow
              label="None"
              value={`${config.name} has no sub-state localities with their own income tax in this dataset.`}
            />
          ) : (
            config.localities.map((loc) => (
              <RuleRow
                key={loc.id}
                label={loc.label}
                value={
                  loc.id === "yonkers"
                    ? `${(loc.rate * 100).toFixed(2)}% surcharge applied to state tax`
                    : `${(loc.rate * 100).toFixed(2)}% on state taxable income`
                }
              />
            ))
          )}
        </Card>

        <Card eyebrow="Headline rate" title="At a glance">
          <Text style={styles.bodyText}>
            <Text style={styles.bodyStrong}>
              {config.name}: {headlineRate(config)}.
            </Text>
            {config.taxStyle === "progressive"
              ? " Each row taxes only that slice of income, not your whole income."
              : ""}
          </Text>
        </Card>

        {config.hasIncomeTax ? (
          <Card
            eyebrow="Brackets"
            title={`${config.name} brackets — ${filingStatusLabels[filingStatus]}`}
          >
            <View style={styles.bracketHead}>
              <Text style={styles.bracketHeadCell}>Taxable income</Text>
              <Text style={[styles.bracketHeadCell, styles.bracketRateCell]}>Rate</Text>
            </View>
            {bracketRows.map(([range, rate], i) => (
              <View key={i} style={styles.bracketRow}>
                <Text style={styles.bracketRange}>{range}</Text>
                <Text style={styles.bracketRateVal}>{rate}</Text>
              </View>
            ))}
            <Text style={styles.cardFootnote}>
              Change your filing status in your tax profile to see the bracket
              boundaries that apply to that status.
            </Text>
          </Card>
        ) : null}

        <Card eyebrow="Caveat" title="What is not yet modeled">
          <RuleRow
            label="Tax credits"
            value="Federal and state credits (EITC, child, education, and retirement credits) are not modeled."
          />
          <RuleRow
            label="Itemized deductions"
            value="The app applies standard deductions only."
          />
          <RuleRow
            label="Reciprocity / part-year"
            value="Multi-state filers and part-year residency aren't handled."
          />
          <RuleRow
            label="Deductibility proof"
            value="Business expenses are treated as possible deductions, but documentation and tax qualification are user responsibilities."
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Building blocks                                                      */
/* ------------------------------------------------------------------ */

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

function RuleRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.ruleRow}>
      <Text style={styles.ruleLabel}>{label}</Text>
      <Text style={styles.ruleValue}>{value}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing.xxl + 32 },

  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: 4 },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: "700" },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 2 },

  note: {
    marginHorizontal: spacing.xl,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.successSurface,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  noteText: { color: colors.textSecondary, fontSize: 12, lineHeight: 18 },

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
  cardFootnote: {
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.xs,
  },

  bodyText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  bodyStrong: { color: colors.textPrimary, fontWeight: "600" },

  step: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.successSurface,
    borderWidth: 1,
    borderColor: colors.successBorder,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  stepNumText: { color: colors.accent, fontSize: 12, fontWeight: "700" },
  stepText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },

  ruleRow: { gap: 2 },
  ruleLabel: { color: colors.textPrimary, fontSize: 13, fontWeight: "600" },
  ruleValue: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },

  bracketHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  bracketHeadCell: {
    color: colors.textDim,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  bracketRateCell: { textAlign: "right" },
  bracketRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  bracketRange: { color: colors.textSecondary, fontSize: 13 },
  bracketRateVal: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
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
