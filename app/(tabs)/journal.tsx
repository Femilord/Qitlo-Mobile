/**
 * Journal tab — the full list of income, business, and personal entries.
 *
 * FlatList sorted by date descending (newest first). Each row:
 *   - Tap to edit (routes to /entry?id=<entryId>).
 *   - Swipe-to-delete with confirm. Swipe is implemented with a basic
 *     Pressable-revealed action rather than react-native-gesture-handler to
 *     keep the dependency footprint small. We can upgrade to gesture-handler
 *     swipes in a later phase if the bare delete row feels clunky.
 *
 * Floating "+" button at the bottom-right opens /entry for a new entry.
 *
 * Header pill summarizes counts by treatment so the user can see at a
 * glance how the journal balances out.
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

import type { JournalEntry } from "qitlo-shared";
import { useAppState, type AppBlob } from "../../src/lib/appState";
import { AppHeader } from "../../src/components/AppHeader";
import { colors, radii, spacing } from "../../src/lib/theme";

const fmt = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

function treatmentColor(t: JournalEntry["taxTreatment"]): string {
  switch (t) {
    case "income":
      return colors.accent;
    case "businessExpense":
      return colors.textSecondary;
    case "personalExpense":
      return colors.textMuted;
  }
}

function treatmentLabel(t: JournalEntry["taxTreatment"]): string {
  switch (t) {
    case "income":
      return "Income";
    case "businessExpense":
      return "Business";
    case "personalExpense":
      return "Personal";
  }
}

export default function JournalScreen() {
  const router = useRouter();
  const { blob, updateBlob } = useAppState();

  const entries = blob?.data.entries ?? [];

  // Sort newest first. Sorting in a memo so an Add → re-render doesn't
  // re-sort the whole list on every keystroke elsewhere.
  const sorted = useMemo(
    () => [...entries].sort((a, b) => b.date.localeCompare(a.date)),
    [entries],
  );

  const counts = useMemo(() => {
    let inc = 0, biz = 0, per = 0;
    let incAmt = 0, bizAmt = 0, perAmt = 0;
    for (const e of entries) {
      if (e.taxTreatment === "income") { inc++; incAmt += e.amount; }
      else if (e.taxTreatment === "businessExpense") { biz++; bizAmt += e.amount; }
      else if (e.taxTreatment === "personalExpense") { per++; perAmt += e.amount; }
    }
    return { inc, biz, per, incAmt, bizAmt, perAmt };
  }, [entries]);

  function onAdd() {
    router.push("/entry");
  }

  function onEdit(id: string) {
    router.push({ pathname: "/entry", params: { id } });
  }

  function onDelete(entry: JournalEntry) {
    if (!blob) return;
    Alert.alert(
      "Delete entry?",
      `Remove "${entry.label}" from your journal?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const next: AppBlob = {
              ...blob.data,
              entries: blob.data.entries.filter((e) => e.id !== entry.id),
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
        <Text style={styles.eyebrow}>Journal</Text>
        <Text style={styles.title}>{entries.length} entries</Text>
      </View>

      {entries.length > 0 && (
        <View style={styles.summary}>
          <SummaryPill label="Income" count={counts.inc} amount={counts.incAmt} tone="ok" />
          <SummaryPill label="Business" count={counts.biz} amount={counts.bizAmt} />
          <SummaryPill label="Personal" count={counts.per} amount={counts.perAmt} />
        </View>
      )}

      {entries.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="document-text-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>No entries yet</Text>
          <Text style={styles.emptyBody}>
            Tap + below to log your first income, business expense, or personal
            expense. Each entry updates the live tax estimate on the Dashboard.
          </Text>
          <Pressable onPress={onAdd} style={styles.emptyBtn}>
            <Ionicons name="add" size={18} color={colors.accentText} />
            <Text style={styles.emptyBtnText}>Add first entry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(e) => e.id}
          style={styles.listFlex}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <EntryRow
              entry={item}
              onEdit={() => onEdit(item.id)}
              onDelete={() => onDelete(item)}
            />
          )}
        />
      )}

      <Pressable onPress={onAdd} style={styles.fab} accessibilityLabel="Add entry">
        <Ionicons name="add" size={24} color={colors.accentText} />
      </Pressable>
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Row                                                                  */
/* ------------------------------------------------------------------ */

function EntryRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: JournalEntry;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const sign = entry.taxTreatment === "income" ? "+" : "−";
  const valueColor = treatmentColor(entry.taxTreatment);
  return (
    <View style={styles.row}>
      <Pressable onPress={onEdit} style={styles.rowMain} hitSlop={4}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel} numberOfLines={1}>
            {entry.label}
          </Text>
          <Text style={styles.rowMeta}>
            {entry.date} · {treatmentLabel(entry.taxTreatment)} · {entry.category}
          </Text>
        </View>
        <Text style={[styles.rowAmount, { color: valueColor }]}>
          {sign}
          {fmt(entry.amount)}
        </Text>
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
  count,
  amount,
  tone,
}: {
  label: string;
  count: number;
  amount: number;
  tone?: "ok";
}) {
  return (
    <View style={[styles.pill, tone === "ok" && styles.pillOk]}>
      <Text style={[styles.pillLabel, tone === "ok" && styles.pillLabelOk]}>
        {label}
      </Text>
      <Text style={[styles.pillValue, tone === "ok" && styles.pillValueOk]}>
        {fmt(amount)}
      </Text>
      <Text style={styles.pillCount}>{count}</Text>
    </View>
  );
}

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
    paddingBottom: spacing.md,
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
  pillLabel: { color: colors.textMuted, fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5 },
  pillLabelOk: { color: colors.accent },
  pillValue: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 2,
    fontVariant: ["tabular-nums"],
  },
  pillValueOk: { color: colors.accent },
  pillCount: { color: colors.textDim, fontSize: 11, marginTop: 2 },

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
    alignItems: "center",
    gap: spacing.md,
  },
  rowLabel: { color: colors.textPrimary, fontSize: 15, fontWeight: "500" },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  rowAmount: { fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
  deleteBtn: { padding: 8, marginLeft: spacing.sm },

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
