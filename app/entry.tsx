/**
 * Entry editor — modal route at /entry.
 *
 * Two modes:
 *   - New entry:  navigate to /entry  → starts empty, defaults to today's date,
 *                 "income" treatment, $0.
 *   - Edit entry: navigate to /entry?id=<entryId>  → pre-fills from the blob.
 *
 * On save: builds a JournalEntry, mutates blob.entries (replace or append),
 * calls updateBlob (which optimistically updates the UI and pushes via the
 * sync layer), then dismisses.
 *
 * Date is intentionally a plain YYYY-MM-DD text input for now — keeps the
 * dependency footprint small and ships in Expo Go without an extra native
 * module. A real DateTimePicker is a polish item for Phase 6.
 */

import { useMemo, useState } from "react";
import {
  Alert,
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
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import type { JournalEntry } from "qitlo-shared";
import { useAppState, type AppBlob } from "../src/lib/appState";
import { colors, radii, spacing } from "../src/lib/theme";

type Treatment = JournalEntry["taxTreatment"];

const TREATMENTS: { value: Treatment; label: string }[] = [
  { value: "income", label: "Income" },
  { value: "businessExpense", label: "Business" },
  { value: "personalExpense", label: "Personal" },
];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function makeId(): string {
  return `e_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function EntryEditorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { blob, updateBlob } = useAppState();

  // Find the existing entry if editing.
  const existing = useMemo(() => {
    if (!id || !blob) return undefined;
    return blob.data.entries.find((e) => e.id === id);
  }, [id, blob]);

  const isEdit = !!existing;

  const [date, setDate] = useState<string>(existing?.date ?? todayIso());
  const [label, setLabel] = useState<string>(existing?.label ?? "");
  const [amount, setAmount] = useState<string>(
    existing?.amount != null ? String(existing.amount) : "",
  );
  const [treatment, setTreatment] = useState<Treatment>(
    existing?.taxTreatment ?? "income",
  );
  const [category, setCategory] = useState<string>(existing?.category ?? "");
  const [journalNote, setJournalNote] = useState<string>(
    existing?.journalNote ?? "",
  );
  const [busy, setBusy] = useState(false);

  function validate(): string | null {
    if (!DATE_REGEX.test(date)) {
      return "Date must be YYYY-MM-DD (e.g., 2025-05-13).";
    }
    if (!label.trim()) {
      return "Add a label so you can find this entry later.";
    }
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return "Amount must be a positive number.";
    }
    return null;
  }

  async function onSave() {
    const err = validate();
    if (err) {
      Alert.alert("Check the entry", err);
      return;
    }
    if (!blob) {
      Alert.alert("Not ready", "Blob not loaded yet — try again in a moment.");
      return;
    }
    setBusy(true);

    const entry: JournalEntry = {
      id: existing?.id ?? makeId(),
      date,
      label: label.trim(),
      amount: Number(amount),
      category: category.trim() || defaultCategory(treatment),
      taxTreatment: treatment,
      journalNote: journalNote.trim() || undefined,
    };

    const nextEntries = isEdit
      ? blob.data.entries.map((e) => (e.id === entry.id ? entry : e))
      : [...blob.data.entries, entry];

    const next: AppBlob = { ...blob.data, entries: nextEntries };
    await updateBlob(next);
    setBusy(false);
    router.back();
  }

  function onDelete() {
    if (!existing || !blob) return;
    Alert.alert(
      "Delete entry?",
      `Remove "${existing.label}" from your journal? This can't be undone from the phone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            const nextEntries = blob.data.entries.filter(
              (e) => e.id !== existing.id,
            );
            const next: AppBlob = { ...blob.data, entries: nextEntries };
            await updateBlob(next);
            setBusy(false);
            router.back();
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header bar */}
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.headerBtn}
            disabled={busy}
          >
            <Text style={styles.headerBtnText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>
            {isEdit ? "Edit entry" : "New entry"}
          </Text>
          <Pressable
            onPress={onSave}
            hitSlop={12}
            style={styles.headerBtn}
            disabled={busy}
          >
            <Text
              style={[
                styles.headerBtnText,
                styles.headerBtnPrimary,
                busy && styles.headerBtnDisabled,
              ]}
            >
              {busy ? "Saving…" : "Save"}
            </Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {/* Treatment segmented control */}
          <View style={styles.field}>
            <Text style={styles.label}>Type</Text>
            <View style={styles.segmented}>
              {TREATMENTS.map((t) => (
                <Pressable
                  key={t.value}
                  onPress={() => setTreatment(t.value)}
                  style={[
                    styles.segmentBtn,
                    treatment === t.value && styles.segmentBtnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      treatment === t.value && styles.segmentTextActive,
                    ]}
                  >
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Amount */}
          <View style={styles.field}>
            <Text style={styles.label}>Amount (USD)</Text>
            <TextInput
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textPlaceholder}
              style={[styles.input, styles.inputAmount]}
            />
          </View>

          {/* Label */}
          <View style={styles.field}>
            <Text style={styles.label}>Label</Text>
            <TextInput
              value={label}
              onChangeText={setLabel}
              autoCapitalize="sentences"
              placeholder={labelPlaceholder(treatment)}
              placeholderTextColor={colors.textPlaceholder}
              style={styles.input}
            />
          </View>

          {/* Date */}
          <View style={styles.field}>
            <Text style={styles.label}>Date</Text>
            <TextInput
              value={date}
              onChangeText={setDate}
              keyboardType="numbers-and-punctuation"
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textPlaceholder}
              style={styles.input}
              maxLength={10}
            />
            <Text style={styles.helperText}>
              Format YYYY-MM-DD · today is {todayIso()}
            </Text>
          </View>

          {/* Category */}
          <View style={styles.field}>
            <Text style={styles.label}>Category</Text>
            <TextInput
              value={category}
              onChangeText={setCategory}
              autoCapitalize="none"
              placeholder={defaultCategory(treatment)}
              placeholderTextColor={colors.textPlaceholder}
              style={styles.input}
            />
            <Text style={styles.helperText}>
              Free text. Common: {commonCategoriesFor(treatment).join(", ")}.
            </Text>
          </View>

          {/* Journal note */}
          <View style={styles.field}>
            <Text style={styles.label}>Note (optional)</Text>
            <TextInput
              value={journalNote}
              onChangeText={setJournalNote}
              multiline
              numberOfLines={4}
              placeholder="What was this for? Any context you want to remember."
              placeholderTextColor={colors.textPlaceholder}
              style={[styles.input, styles.inputMulti]}
              textAlignVertical="top"
            />
          </View>

          {isEdit && (
            <Pressable
              onPress={onDelete}
              disabled={busy}
              style={styles.dangerBtn}
            >
              <Ionicons
                name="trash-outline"
                size={16}
                color={colors.error}
              />
              <Text style={styles.dangerBtnText}>Delete entry</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function defaultCategory(treatment: Treatment): string {
  switch (treatment) {
    case "income":
      return "freelance";
    case "businessExpense":
      return "supplies";
    case "personalExpense":
      return "other";
  }
}

function commonCategoriesFor(treatment: Treatment): string[] {
  switch (treatment) {
    case "income":
      return ["freelance", "salary", "dividends", "rental", "other"];
    case "businessExpense":
      return ["supplies", "software", "travel", "equipment", "services", "marketing"];
    case "personalExpense":
      return ["housing", "food", "utilities", "transport", "healthcare", "other"];
  }
}

function labelPlaceholder(treatment: Treatment): string {
  switch (treatment) {
    case "income":
      return "Client invoice, paycheck, etc.";
    case "businessExpense":
      return "What did you buy for the business?";
    case "personalExpense":
      return "What was this expense?";
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex1: { flex: 1 },
  scroll: {
    padding: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl + 32,
  },

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
  headerTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
  },

  field: { marginTop: spacing.lg },
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
  inputAmount: {
    fontSize: 22,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  inputMulti: {
    minHeight: 96,
    paddingTop: 10,
  },
  helperText: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 6,
    lineHeight: 16,
  },

  segmented: {
    flexDirection: "row",
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: radii.md,
  },
  segmentBtnActive: { backgroundColor: colors.bg },
  segmentText: { color: colors.textMuted, fontSize: 13, fontWeight: "500" },
  segmentTextActive: { color: colors.textPrimary, fontWeight: "600" },

  dangerBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: spacing.xxl,
    paddingVertical: 12,
    borderRadius: radii.lg,
    backgroundColor: colors.errorSurface,
    borderWidth: 1,
    borderColor: colors.errorBorder,
  },
  dangerBtnText: { color: colors.error, fontSize: 14, fontWeight: "500" },
});
