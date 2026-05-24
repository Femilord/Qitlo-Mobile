/**
 * Debt entry editor — modal route at /debt-entry.
 *
 * Two modes:
 *   - New debt:  /debt-entry  → starts empty
 *   - Edit:      /debt-entry?id=<entryId>  → pre-fills from blob.debtEntries
 *
 * On save: appends or replaces in blob.debtEntries, calls updateBlob, then
 * dismisses. The classifier runs immediately on read so the next render of
 * the Debt screen reflects the new badge.
 *
 * Debt type and use are picked via Modal overlays — there are 7 types and
 * 6 uses, too many for a segmented control to read well.
 */

import { useMemo, useState } from "react";
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
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

import { classifyDebtImpact, type DebtEntry, type DebtType, type DebtUse } from "qitlo-shared";

import { useAppState, type AppBlob } from "../src/lib/appState";
import { colors, radii, spacing } from "../src/lib/theme";

const TYPE_OPTIONS: { value: DebtType; label: string; description: string }[] = [
  { value: "personalLoan", label: "Personal loan", description: "Unsecured personal loan from a bank or lender." },
  { value: "creditCard", label: "Credit card", description: "Revolving credit-card debt." },
  { value: "mortgage", label: "Mortgage", description: "Loan secured by your home." },
  { value: "studentLoan", label: "Student loan", description: "Federal or private education loan." },
  { value: "businessLoan", label: "Business loan", description: "Loan taken for business purposes." },
  { value: "autoLoan", label: "Auto loan", description: "Loan secured by a vehicle." },
  { value: "investmentLoan", label: "Investment loan", description: "Margin loan or other investment-related debt." },
];

const USE_OPTIONS: { value: DebtUse; label: string; description: string }[] = [
  { value: "personal", label: "Personal", description: "Spent on personal living expenses." },
  { value: "business", label: "Business", description: "Spent on business operations." },
  { value: "education", label: "Education", description: "Tuition, books, or other education costs." },
  { value: "home", label: "Home", description: "Buying or improving a primary residence." },
  { value: "investment", label: "Investment", description: "Buying investments (securities, real estate, etc.)." },
  { value: "mixed", label: "Mixed use", description: "Funds were used for more than one of the above." },
];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function makeId(): string {
  return `d_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function DebtEntryEditorScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { blob, updateBlob } = useAppState();

  const existing = useMemo(() => {
    if (!id || !blob) return undefined;
    return blob.data.debtEntries.find((d) => d.id === id);
  }, [id, blob]);
  const isEdit = !!existing;

  const [name, setName] = useState<string>(existing?.name ?? "");
  const [type, setType] = useState<DebtType>(existing?.type ?? "personalLoan");
  const [use, setUse] = useState<DebtUse>(existing?.use ?? "personal");
  const [interestPaid, setInterestPaid] = useState<string>(
    existing?.interestPaid != null ? String(existing.interestPaid) : "",
  );
  const [date, setDate] = useState<string>(existing?.date ?? todayIso());
  const [busy, setBusy] = useState(false);

  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [usePickerOpen, setUsePickerOpen] = useState(false);

  const typeLabel = TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type;
  const useLabel = USE_OPTIONS.find((o) => o.value === use)?.label ?? use;

  // Live preview of the classifier badge as the user changes type/use.
  const preview = useMemo(() => classifyDebtImpact({ type, use }), [type, use]);

  function validate(): string | null {
    if (!name.trim()) return "Give this debt a name so you can find it later.";
    if (!DATE_REGEX.test(date)) return "Date must be YYYY-MM-DD.";
    const amt = Number(interestPaid);
    if (!Number.isFinite(amt) || amt < 0) return "Interest paid must be a non-negative number.";
    return null;
  }

  async function onSave() {
    const err = validate();
    if (err) {
      Alert.alert("Check the debt", err);
      return;
    }
    if (!blob) return;
    setBusy(true);
    const entry: DebtEntry = {
      id: existing?.id ?? makeId(),
      date,
      name: name.trim(),
      type,
      use,
      interestPaid: Number(interestPaid),
    };
    const nextDebts = isEdit
      ? blob.data.debtEntries.map((d) => (d.id === entry.id ? entry : d))
      : [...blob.data.debtEntries, entry];
    const next: AppBlob = { ...blob.data, debtEntries: nextDebts };
    await updateBlob(next);
    setBusy(false);
    router.back();
  }

  function onDelete() {
    if (!existing || !blob) return;
    Alert.alert(
      "Delete debt?",
      `Remove "${existing.name}" from your debt list?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            const nextDebts = blob.data.debtEntries.filter((d) => d.id !== existing.id);
            const next: AppBlob = { ...blob.data, debtEntries: nextDebts };
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
        <View style={styles.header}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.headerBtn}
            disabled={busy}
          >
            <Text style={styles.headerBtnText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{isEdit ? "Edit debt" : "New debt"}</Text>
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
          {/* Name */}
          <View style={styles.field}>
            <Text style={styles.label}>Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              autoCapitalize="sentences"
              placeholder="Visa, Sallie Mae, Wells Fargo HELOC…"
              placeholderTextColor={colors.textPlaceholder}
              style={styles.input}
            />
          </View>

          {/* Type */}
          <View style={styles.field}>
            <Text style={styles.label}>Debt type</Text>
            <Pressable onPress={() => setTypePickerOpen(true)} style={styles.pickerRow}>
              <Text style={[styles.pickerValue, { flex: 1 }]}>{typeLabel}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Use */}
          <View style={styles.field}>
            <Text style={styles.label}>What was the money used for?</Text>
            <Pressable onPress={() => setUsePickerOpen(true)} style={styles.pickerRow}>
              <Text style={[styles.pickerValue, { flex: 1 }]}>{useLabel}</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Classifier preview */}
          <View style={[styles.previewCard, toneCardStyle(preview.tone)]}>
            <View style={styles.previewHead}>
              <Ionicons
                name={toneIcon(preview.tone)}
                size={16}
                color={toneIconColor(preview.tone)}
              />
              <Text style={[styles.previewLabel, { color: toneIconColor(preview.tone) }]}>
                {preview.label}
              </Text>
            </View>
            <Text style={styles.previewBody}>{preview.detail}</Text>
          </View>

          {/* Interest paid */}
          <View style={styles.field}>
            <Text style={styles.label}>Interest paid year-to-date (USD)</Text>
            <TextInput
              value={interestPaid}
              onChangeText={setInterestPaid}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={colors.textPlaceholder}
              style={[styles.input, styles.inputAmount]}
            />
            <Text style={styles.helperText}>
              The cumulative interest you've paid on this debt so far this tax year.
            </Text>
          </View>

          {/* Date */}
          <View style={styles.field}>
            <Text style={styles.label}>Date (last update)</Text>
            <TextInput
              value={date}
              onChangeText={setDate}
              keyboardType="numbers-and-punctuation"
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.textPlaceholder}
              style={styles.input}
              maxLength={10}
            />
            <Text style={styles.helperText}>Format YYYY-MM-DD · today is {todayIso()}</Text>
          </View>

          {isEdit && (
            <Pressable onPress={onDelete} disabled={busy} style={styles.dangerBtn}>
              <Ionicons name="trash-outline" size={16} color={colors.error} />
              <Text style={styles.dangerBtnText}>Delete debt</Text>
            </Pressable>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Pickers */}
      <OptionPickerModal
        visible={typePickerOpen}
        title="Debt type"
        options={TYPE_OPTIONS}
        currentValue={type}
        onSelect={(v) => { setType(v as DebtType); setTypePickerOpen(false); }}
        onClose={() => setTypePickerOpen(false)}
      />
      <OptionPickerModal
        visible={usePickerOpen}
        title="Use of funds"
        options={USE_OPTIONS}
        currentValue={use}
        onSelect={(v) => { setUse(v as DebtUse); setUsePickerOpen(false); }}
        onClose={() => setUsePickerOpen(false)}
      />
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Reusable option picker                                               */
/* ------------------------------------------------------------------ */

function OptionPickerModal<T extends string>({
  visible,
  title,
  options,
  currentValue,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: { value: T; label: string; description: string }[];
  currentValue: T;
  onSelect: (v: T) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{title}</Text>
          <View style={styles.headerBtn} />
        </View>
        <FlatList
          data={options}
          keyExtractor={(o) => o.value}
          ItemSeparatorComponent={() => <View style={styles.modalSeparator} />}
          renderItem={({ item }) => (
            <Pressable onPress={() => onSelect(item.value)} style={styles.modalRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalRowLabel}>{item.label}</Text>
                <Text style={styles.modalRowSub} numberOfLines={2}>{item.description}</Text>
              </View>
              {currentValue === item.value && (
                <Ionicons name="checkmark" size={18} color={colors.accent} style={{ marginLeft: 8 }} />
              )}
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Tone helpers                                                         */
/* ------------------------------------------------------------------ */

function toneIcon(tone: "impactPossible" | "impactReview" | "impactNone"): keyof typeof Ionicons.glyphMap {
  switch (tone) {
    case "impactPossible": return "checkmark-circle-outline";
    case "impactReview": return "alert-circle-outline";
    case "impactNone": return "ellipse-outline";
  }
}

function toneIconColor(tone: "impactPossible" | "impactReview" | "impactNone"): string {
  switch (tone) {
    case "impactPossible": return colors.accent;
    case "impactReview": return colors.warningText;
    case "impactNone": return colors.textMuted;
  }
}

function toneCardStyle(tone: "impactPossible" | "impactReview" | "impactNone") {
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
  modalSafe: { flex: 1, backgroundColor: colors.bg },
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

  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: spacing.sm,
  },
  pickerValue: { color: colors.textPrimary, fontSize: 16, fontWeight: "500" },

  helperText: { color: colors.textDim, fontSize: 12, marginTop: 6, lineHeight: 16 },

  previewCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  previewHead: { flexDirection: "row", alignItems: "center", gap: 6 },
  previewLabel: { fontSize: 13, fontWeight: "600" },
  previewBody: { color: colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 17 },

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

  modalSeparator: { height: 1, backgroundColor: colors.border },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  modalRowLabel: { color: colors.textPrimary, fontSize: 15 },
  modalRowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
});
