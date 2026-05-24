/**
 * Debt Impact tab — the debt journal.
 *
 * Reads blob.data.debtEntries (now a first-class field after the
 * passthrough promotion). Each row classifies via classifyDebtImpact:
 *   - impactPossible: probably reduces business income (business loans, etc.)
 *   - impactReview:   may matter, needs documentation (mortgage, student, ...)
 *   - impactNone:     personal credit card / personal loan interest
 *
 * Tap to edit, trash icon to delete. FAB to add. Summary at the top splits
 * total interest paid into "possible impact" vs "no impact" buckets so the
 * user can see at a glance how much of their interest may be tax-relevant.
 */

import { useMemo } from "react";
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { classifyDebtImpact, type DebtEntry } from "qitlo-shared";

import { useAppState, type AppBlob } from "../../src/lib/appState";
import { AppHeader } from "../../src/components/AppHeader";
import { colors, radii, spacing } from "../../src/lib/theme";

const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function typeLabel(t: DebtEntry["type"]): string {
  switch (t) {
    case "personalLoan": return "Personal loan";
    case "creditCard": return "Credit card";
    case "mortgage": return "Mortgage";
    case "studentLoan": return "Student loan";
    case "businessLoan": return "Business loan";
    case "autoLoan": return "Auto loan";
    case "investmentLoan": return "Investment loan";
  }
}

function useLabel(u: DebtEntry["use"]): string {
  switch (u) {
    case "personal": return "Personal";
    case "business": return "Business";
    case "education": return "Education";
    case "home": return "Home";
    case "investment": return "Investment";
    case "mixed": return "Mixed use";
  }
}

export default function DebtScreen() {
  const router = useRouter();
  const { blob, updateBlob } = useAppState();
  const debts = blob?.data.debtEntries ?? [];

  const sorted = useMemo(
    () => [...debts].sort((a, b) => b.date.localeCompare(a.date)),
    [debts],
  );

  // Roll up by impact tone for the summary.
  const summary = useMemo(() => {
    let possible = 0, review = 0, none = 0;
    let possibleAmt = 0, reviewAmt = 0, noneAmt = 0;
    for (const d of debts) {
      const tone = classifyDebtImpact(d).tone;
      if (tone === "impactPossible") { possible++; possibleAmt += d.interestPaid; }
      else if (tone === "impactReview") { review++; reviewAmt += d.interestPaid; }
      else { none++; noneAmt += d.interestPaid; }
    }
    return { possible, review, none, possibleAmt, reviewAmt, noneAmt };
  }, [debts]);

  function onAdd() {
    router.push("/debt-entry");
  }

  function onEdit(id: string) {
    router.push({ pathname: "/debt-entry", params: { id } });
  }

  function onDelete(d: DebtEntry) {
    if (!blob) return;
    Alert.alert(
      "Delete debt?",
      `Remove "${d.name}" from your debt list?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const next: AppBlob = {
              ...blob.data,
              debtEntries: blob.data.debtEntries.filter((x) => x.id !== d.id),
            };
            await updateBlob(next);
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AppHeader />
      <View style={styles.header}>
        <Text style={styles.eyebrow}>Debt Impact</Text>
        <Text style={styles.title}>
          {debts.length} {debts.length === 1 ? "debt" : "debts"}
        </Text>
      </View>

      {debts.length > 0 && (
        <View style={styles.summary}>
          <SummaryPill
            label="Possible impact"
            sub="May reduce taxes"
            amount={summary.possibleAmt + summary.reviewAmt}
            count={summary.possible + summary.review}
            tone="ok"
          />
          <SummaryPill
            label="No PIT impact"
            sub="Personal interest"
            amount={summary.noneAmt}
            count={summary.none}
          />
        </View>
      )}

      <View style={styles.disclaimerBox}>
        <Ionicons
          name="information-circle-outline"
          size={14}
          color={colors.textMuted}
        />
        <Text style={styles.disclaimerText}>
          Qitlo under-promises by design — items are "possible" or "review", never
          "deductible". Confirm with your tax advisor before claiming any of these.
        </Text>
      </View>

      {debts.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="card-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No debts logged</Text>
          <Text style={styles.emptyBody}>
            Add credit cards, student loans, mortgages, business loans, and other
            debt to see how the interest you've paid might affect your tax bill.
          </Text>
          <Pressable onPress={onAdd} style={styles.emptyBtn}>
            <Ionicons name="add" size={18} color={colors.accentText} />
            <Text style={styles.emptyBtnText}>Add first debt</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(d) => d.id}
          style={styles.listFlex}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <DebtRow
              entry={item}
              onEdit={() => onEdit(item.id)}
              onDelete={() => onDelete(item)}
            />
          )}
        />
      )}

      <Pressable onPress={onAdd} style={styles.fab} accessibilityLabel="Add debt">
        <Ionicons name="add" size={24} color={colors.accentText} />
      </Pressable>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Row                                                                  */
/* ------------------------------------------------------------------ */

function DebtRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: DebtEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const impact = classifyDebtImpact(entry);
  return (
    <View style={styles.row}>
      <Pressable onPress={onEdit} style={styles.rowMain} hitSlop={4}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowName} numberOfLines={1}>
            {entry.name}
          </Text>
          <Text style={styles.rowMeta}>
            {typeLabel(entry.type)} · {useLabel(entry.use)} · {entry.date}
          </Text>
          <View style={[styles.badge, toneBadgeStyle(impact.tone)]}>
            <Ionicons
              name={toneIcon(impact.tone)}
              size={11}
              color={toneTextColor(impact.tone)}
            />
            <Text style={[styles.badgeText, { color: toneTextColor(impact.tone) }]}>
              {impact.label}
            </Text>
          </View>
        </View>
        <View style={styles.rowRight}>
          <Text style={styles.rowAmount}>{fmt(entry.interestPaid)}</Text>
          <Text style={styles.rowAmountSub}>interest YTD</Text>
        </View>
      </Pressable>
      <Pressable onPress={onDelete} style={styles.deleteBtn} hitSlop={10}>
        <Ionicons name="trash-outline" size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Summary pill                                                         */
/* ------------------------------------------------------------------ */

function SummaryPill({
  label,
  sub,
  count,
  amount,
  tone,
}: {
  label: string;
  sub: string;
  count: number;
  amount: number;
  tone?: "ok";
}) {
  return (
    <View style={[styles.pill, tone === "ok" && styles.pillOk]}>
      <Text style={[styles.pillLabel, tone === "ok" && styles.pillLabelOk]}>{label}</Text>
      <Text style={[styles.pillValue, tone === "ok" && styles.pillValueOk]}>
        {fmt(amount)}
      </Text>
      <Text style={styles.pillSub}>
        {count} {count === 1 ? "debt" : "debts"} · {sub}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Tone helpers (same palette as the editor modal)                      */
/* ------------------------------------------------------------------ */

function toneIcon(tone: "impactPossible" | "impactReview" | "impactNone"): keyof typeof Ionicons.glyphMap {
  switch (tone) {
    case "impactPossible": return "checkmark-circle-outline";
    case "impactReview": return "alert-circle-outline";
    case "impactNone": return "ellipse-outline";
  }
}

function toneTextColor(tone: "impactPossible" | "impactReview" | "impactNone"): string {
  switch (tone) {
    case "impactPossible": return colors.accent;
    case "impactReview": return colors.warningText;
    case "impactNone": return colors.textMuted;
  }
}

function toneBadgeStyle(tone: "impactPossible" | "impactReview" | "impactNone") {
  switch (tone) {
    case "impactPossible":
      return { backgroundColor: colors.successSurface, borderColor: colors.successBorder };
    case "impactReview":
      return { backgroundColor: colors.warningSurface, borderColor: colors.warningBorder };
    case "impactNone":
      return { backgroundColor: colors.surface, borderColor: colors.border };
  }
}

/* ------------------------------------------------------------------ */
/* Styles                                                               */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },

  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: 4 },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  title: { color: colors.textPrimary, fontSize: 24, fontWeight: "700" },

  summary: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  pill: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pillOk: { borderColor: colors.successBorder, backgroundColor: colors.successSurface },
  pillLabel: {
    color: colors.textMuted,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pillLabelOk: { color: colors.accent },
  pillValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  pillValueOk: { color: colors.accent },
  pillSub: { color: colors.textDim, fontSize: 11, marginTop: 2 },

  disclaimerBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
  },
  disclaimerText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
  },

  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    gap: spacing.md,
  },
  emptyTitle: { color: colors.textPrimary, fontSize: 18, fontWeight: "600" },
  emptyBody: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 320,
  },
  emptyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    marginTop: spacing.sm,
  },
  emptyBtnText: { color: colors.accentText, fontSize: 15, fontWeight: "700" },

  listFlex: { flex: 1 },
  list: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: 96 },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: 2 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  rowName: { color: colors.textPrimary, fontSize: 15, fontWeight: "500" },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  rowRight: { alignItems: "flex-end" },
  rowAmount: { color: colors.textPrimary, fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
  rowAmountSub: { color: colors.textDim, fontSize: 10, marginTop: 2 },
  deleteBtn: { padding: 8, marginLeft: spacing.sm, alignSelf: "center" },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    alignSelf: "flex-start",
    marginTop: 6,
  },
  badgeText: { fontSize: 11, fontWeight: "500" },

  fab: {
    position: "absolute",
    right: spacing.xl,
    bottom: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 6,
  },
});
