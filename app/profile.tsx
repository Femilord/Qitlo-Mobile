/**
 * Tax profile editor — modal route at /profile.
 *
 * Edits the four fields of TaxProfile that affect the tax engine:
 *   - filingStatus (single / marriedJoint / marriedSeparate / headOfHousehold)
 *   - state (all 50 + DC, sorted by name)
 *   - locality (conditional; only shown for states with sub-state income tax)
 *   - dependents (integer 0..n)
 *
 * State and locality are picked via a full-screen Modal overlay because 51
 * options don't fit cleanly inline. The locality list shows the Suffolk
 * County hint inline so users don't silently default to NYC tax.
 *
 * Save calls updateBlob with the new profile. Mobile's wire shape spreads
 * the passthrough first so webapp-only fields (user, debtEntries) survive.
 * The tax engine runs immediately on save and the Dashboard headline
 * recalculates.
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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
  STATES_LIST,
  getStateConfig,
  type StateCode,
  type FilingStatus,
  type TaxProfile,
} from "qitlo-shared";

import { useAppState, type AppBlob } from "../src/lib/appState";
import { colors, radii, spacing } from "../src/lib/theme";

type FilingOption = { value: FilingStatus; label: string; short: string };

const FILING_OPTIONS: FilingOption[] = [
  { value: "single", label: "Single", short: "Single" },
  { value: "marriedJoint", label: "Married filing jointly", short: "MFJ" },
  { value: "marriedSeparate", label: "Married filing separately", short: "MFS" },
  { value: "headOfHousehold", label: "Head of household", short: "HoH" },
];

/** Special hint shown above NY's locality list — keeps users from silently
 *  defaulting to NYC. Mirrors the webapp's identical guard. */
const NY_LOCALITY_HINT =
  "Only pick NYC or Yonkers if you actually live there. Suffolk, Nassau, Westchester (non-Yonkers), and upstate residents are 'Elsewhere in New York'.";

export default function ProfileEditorScreen() {
  const router = useRouter();
  const { blob, updateBlob } = useAppState();

  const current = blob?.data.taxProfile;

  // Local form state seeded from the current profile. Avoids two-way
  // binding directly to blob so the user can cancel without side effects.
  const [filingStatus, setFilingStatus] = useState<FilingStatus>(
    current?.filingStatus ?? "single",
  );
  const [stateCode, setStateCode] = useState<StateCode>(
    current?.state ?? "NY",
  );
  const [locality, setLocality] = useState<string | undefined>(
    current?.locality,
  );
  const [dependents, setDependents] = useState<string>(
    String(current?.dependents ?? 0),
  );
  const [busy, setBusy] = useState(false);

  // Modal pickers
  const [statePickerOpen, setStatePickerOpen] = useState(false);
  const [localityPickerOpen, setLocalityPickerOpen] = useState(false);

  const stateConfig = useMemo(() => getStateConfig(stateCode), [stateCode]);
  const hasLocalities = stateConfig.localities.length > 0;

  // When state changes, drop any locality that doesn't belong to the new state.
  function onStateChange(next: StateCode) {
    setStateCode(next);
    setStatePickerOpen(false);
    const nextConfig = getStateConfig(next);
    if (!nextConfig.localities.find((l) => l.id === locality)) {
      setLocality(undefined);
    }
  }

  function onLocalityChange(next: string | undefined) {
    setLocality(next);
    setLocalityPickerOpen(false);
  }

  function validate(): string | null {
    const deps = Number(dependents);
    if (!Number.isFinite(deps) || deps < 0 || deps > 99 || !Number.isInteger(deps)) {
      return "Dependents must be a whole number between 0 and 99.";
    }
    return null;
  }

  async function onSave() {
    const err = validate();
    if (err) {
      Alert.alert("Check the profile", err);
      return;
    }
    if (!blob) return;
    setBusy(true);
    const nextProfile: TaxProfile = {
      taxYear: 2025,
      filingStatus,
      state: stateCode,
      locality: locality && locality !== "" ? locality : undefined,
      dependents: Number(dependents),
    };
    const next: AppBlob = { ...blob.data, taxProfile: nextProfile };
    await updateBlob(next);
    setBusy(false);
    router.back();
  }

  const localityLabel = useMemo(() => {
    if (!locality) return `Elsewhere in ${stateConfig.name}`;
    const found = stateConfig.localities.find((l) => l.id === locality);
    return found?.label ?? `Elsewhere in ${stateConfig.name}`;
  }, [locality, stateConfig]);

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
          <Text style={styles.headerTitle}>Tax profile</Text>
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
          {/* Filing status */}
          <View style={styles.field}>
            <Text style={styles.label}>Filing status</Text>
            <View style={styles.filingGrid}>
              {FILING_OPTIONS.map((opt) => (
                <Pressable
                  key={opt.value}
                  onPress={() => setFilingStatus(opt.value)}
                  style={[
                    styles.filingBtn,
                    filingStatus === opt.value && styles.filingBtnActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.filingShort,
                      filingStatus === opt.value && styles.filingTextActive,
                    ]}
                  >
                    {opt.short}
                  </Text>
                  <Text
                    style={[
                      styles.filingLabel,
                      filingStatus === opt.value && styles.filingTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* State */}
          <View style={styles.field}>
            <Text style={styles.label}>State of residence</Text>
            <Pressable
              onPress={() => setStatePickerOpen(true)}
              style={styles.pickerRow}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.pickerValue}>{stateConfig.name}</Text>
                <Text style={styles.pickerSub}>{stateConfig.code}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Locality — only when state has localities */}
          {hasLocalities && (
            <View style={styles.field}>
              <Text style={styles.label}>Locality (city / county)</Text>
              <Pressable
                onPress={() => setLocalityPickerOpen(true)}
                style={styles.pickerRow}
              >
                <Text style={[styles.pickerValue, { flex: 1 }]}>{localityLabel}</Text>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.textMuted}
                />
              </Pressable>
              {stateCode === "NY" && (
                <Text style={styles.helperText}>{NY_LOCALITY_HINT}</Text>
              )}
            </View>
          )}

          {/* Dependents */}
          <View style={styles.field}>
            <Text style={styles.label}>Dependents</Text>
            <View style={styles.depRow}>
              <Pressable
                onPress={() => setDependents(String(Math.max(0, (Number(dependents) || 0) - 1)))}
                style={styles.depStep}
                hitSlop={4}
              >
                <Ionicons name="remove" size={20} color={colors.textPrimary} />
              </Pressable>
              <TextInput
                value={dependents}
                onChangeText={(v) => setDependents(v.replace(/[^0-9]/g, ""))}
                keyboardType="number-pad"
                style={[styles.input, styles.depInput]}
                maxLength={2}
                textAlign="center"
              />
              <Pressable
                onPress={() => setDependents(String((Number(dependents) || 0) + 1))}
                style={styles.depStep}
                hitSlop={4}
              >
                <Ionicons name="add" size={20} color={colors.textPrimary} />
              </Pressable>
            </View>
            <Text style={styles.helperText}>
              Count of dependents you claim. Affects state exemption calculations
              where applicable.
            </Text>
          </View>

          {/* Tax year — read-only */}
          <View style={styles.field}>
            <Text style={styles.label}>Tax year</Text>
            <View style={[styles.pickerRow, styles.pickerRowDisabled]}>
              <Text style={[styles.pickerValue, { flex: 1 }]}>2025</Text>
              <Text style={styles.pickerSub}>fixed</Text>
            </View>
            <Text style={styles.helperText}>
              Multi-year support is on the roadmap. The engine ships with 2025
              brackets only for now.
            </Text>
          </View>

          {/* State notes — context for the user about what they picked */}
          <View style={styles.notesCard}>
            <Text style={styles.notesTitle}>About {stateConfig.name}</Text>
            <Text style={styles.notesBody}>{stateConfig.notes}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* State picker modal */}
      <StatePickerModal
        visible={statePickerOpen}
        currentCode={stateCode}
        onSelect={onStateChange}
        onClose={() => setStatePickerOpen(false)}
      />

      {/* Locality picker modal */}
      {hasLocalities && (
        <LocalityPickerModal
          visible={localityPickerOpen}
          stateCode={stateCode}
          stateName={stateConfig.name}
          currentLocality={locality}
          onSelect={onLocalityChange}
          onClose={() => setLocalityPickerOpen(false)}
        />
      )}
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* State picker — full-screen modal with search                         */
/* ------------------------------------------------------------------ */

function StatePickerModal({
  visible,
  currentCode,
  onSelect,
  onClose,
}: {
  visible: boolean;
  currentCode: StateCode;
  onSelect: (code: StateCode) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    if (!query.trim()) return STATES_LIST;
    const q = query.trim().toLowerCase();
    return STATES_LIST.filter(
      (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
    );
  }, [query]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Select state</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.textMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or 2-letter code"
            placeholderTextColor={colors.textPlaceholder}
            autoCapitalize="none"
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.code}
          ItemSeparatorComponent={() => <View style={styles.modalSeparator} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onSelect(item.code)}
              style={styles.modalRow}
            >
              <Text style={styles.modalRowLabel}>{item.name}</Text>
              <View style={styles.modalRowRight}>
                <Text style={styles.modalRowCode}>{item.code}</Text>
                {item.code === currentCode && (
                  <Ionicons
                    name="checkmark"
                    size={18}
                    color={colors.accent}
                    style={{ marginLeft: 8 }}
                  />
                )}
              </View>
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Locality picker — list of localities for the current state           */
/* ------------------------------------------------------------------ */

function LocalityPickerModal({
  visible,
  stateCode,
  stateName,
  currentLocality,
  onSelect,
  onClose,
}: {
  visible: boolean;
  stateCode: StateCode;
  stateName: string;
  currentLocality: string | undefined;
  onSelect: (id: string | undefined) => void;
  onClose: () => void;
}) {
  const config = getStateConfig(stateCode);
  // Synthesize an "Elsewhere" row at the top so users have a clean
  // "I don't live in any of these localities" option.
  type Row = { id: string | undefined; label: string; description?: string };
  const rows: Row[] = [
    { id: undefined, label: `Elsewhere in ${stateName}`, description: "No locality tax." },
    ...config.localities.map((l) => ({
      id: l.id,
      label: l.label,
      description: l.description,
    })),
  ];

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.modalSafe} edges={["top", "bottom"]}>
        <View style={styles.header}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.headerBtn}>
            <Text style={styles.headerBtnText}>Cancel</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Locality in {stateName}</Text>
          <View style={styles.headerBtn} />
        </View>
        {stateCode === "NY" && (
          <View style={styles.modalHintBox}>
            <Ionicons name="information-circle-outline" size={16} color={colors.warningText} />
            <Text style={styles.modalHintText}>{NY_LOCALITY_HINT}</Text>
          </View>
        )}
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id ?? "__elsewhere__"}
          ItemSeparatorComponent={() => <View style={styles.modalSeparator} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onSelect(item.id)}
              style={styles.modalRow}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.modalRowLabel}>{item.label}</Text>
                {item.description ? (
                  <Text style={styles.modalRowSub} numberOfLines={2}>
                    {item.description}
                  </Text>
                ) : null}
              </View>
              {currentLocality === item.id && (
                <Ionicons
                  name="checkmark"
                  size={18}
                  color={colors.accent}
                  style={{ marginLeft: 8 }}
                />
              )}
            </Pressable>
          )}
        />
      </SafeAreaView>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                               */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  modalSafe: { flex: 1, backgroundColor: colors.bg },
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
  pickerRowDisabled: { opacity: 0.6 },
  pickerValue: { color: colors.textPrimary, fontSize: 16, fontWeight: "500" },
  pickerSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },

  helperText: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 6,
    lineHeight: 16,
  },

  filingGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filingBtn: {
    flexBasis: "48%",
    flexGrow: 1,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
    paddingVertical: 12,
    paddingHorizontal: 12,
    alignItems: "center",
  },
  filingBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filingShort: { color: colors.textPrimary, fontSize: 14, fontWeight: "700" },
  filingLabel: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
    textAlign: "center",
  },
  filingTextActive: { color: colors.accentText },

  depRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  depStep: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  depInput: {
    flex: 1,
    fontSize: 22,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },

  notesCard: {
    marginTop: spacing.xl,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.xl,
  },
  notesTitle: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
  },
  notesBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },

  /* Modal picker */
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    margin: spacing.lg,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.lg,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 15,
    paddingVertical: 4,
  },
  modalSeparator: { height: 1, backgroundColor: colors.border },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  modalRowLabel: { color: colors.textPrimary, fontSize: 15, flex: 1 },
  modalRowSub: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  modalRowRight: { flexDirection: "row", alignItems: "center" },
  modalRowCode: {
    color: colors.textMuted,
    fontSize: 12,
    fontVariant: ["tabular-nums"],
  },

  modalHintBox: {
    flexDirection: "row",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.warningSurface,
    borderColor: colors.warningBorder,
    borderWidth: 1,
    borderRadius: radii.lg,
    alignItems: "flex-start",
  },
  modalHintText: {
    flex: 1,
    color: colors.warningText,
    fontSize: 12,
    lineHeight: 17,
  },
});
