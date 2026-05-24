/**
 * Help & support — modal route at /help.
 *
 * Reached from the avatar dropdown in the top bar. Keeps support self-contained
 * on-device: a few expandable FAQs plus a "contact support" action that opens
 * the user's mail client pre-addressed to the support inbox.
 */

import { useState } from "react";
import {
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { colors, radii, spacing } from "../src/lib/theme";

const SUPPORT_EMAIL = "support@qitlo.app";

const FAQS: { q: string; a: string }[] = [
  {
    q: "How is the tax estimate calculated?",
    a: "Qitlo runs the same model as the webapp: it nets your income against business expenses, then applies federal income tax, self-employment (FICA) tax, and your state/locality rules. The Display toggles on the Dashboard only change what's shown in the headline — the underlying math always runs in full.",
  },
  {
    q: "Is my data private?",
    a: "Yes. Your entries and profile are end-to-end encrypted with a key derived from your password. The server only ever stores ciphertext, and your password never leaves your device.",
  },
  {
    q: "How do I back up my data?",
    a: "Open the avatar menu → Account & backup → Export encrypted backup. You'll choose a passphrase and get a JSON file you can re-import on the webapp or another device.",
  },
  {
    q: "Can I change my profile photo?",
    a: "Tap your avatar in the top-right, then tap the photo in the menu header to choose a new image or remove it. The photo is stored only on this device.",
  },
  {
    q: "I forgot my password — what now?",
    a: "Because your data is encrypted with your password, it can't be recovered without it. If you have an exported backup and remember that passphrase, you can restore from it. Otherwise reach out to support below.",
  },
];

export default function HelpScreen() {
  const router = useRouter();

  async function contactSupport() {
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      "Qitlo Mobile support",
    )}`;
    const ok = await Linking.canOpenURL(url).catch(() => false);
    if (ok) Linking.openURL(url);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>Done</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Help &amp; support</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.intro}>
          Quick answers to common questions. Still stuck? Reach the team and
          we'll get back to you.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Frequently asked</Text>
          {FAQS.map((item, i) => (
            <Faq key={i} q={item.q} a={item.a} last={i === FAQS.length - 1} />
          ))}
        </View>

        <Pressable onPress={contactSupport} style={styles.contactBtn}>
          <Ionicons name="mail-outline" size={18} color={colors.accentText} />
          <Text style={styles.contactBtnText}>Contact support</Text>
        </Pressable>
        <Text style={styles.footnote}>
          Writes to {SUPPORT_EMAIL} from your mail app.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function Faq({ q, a, last }: { q: string; a: string; last?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.faq, !last && styles.faqBorder]}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={styles.faqHead}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
      >
        <Text style={styles.faqQ}>{q}</Text>
        <Ionicons
          name={open ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.textMuted}
        />
      </Pressable>
      {open && <Text style={styles.faqA}>{a}</Text>}
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

  intro: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: spacing.lg,
  },

  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
  },
  cardTitle: {
    color: colors.textPrimary,
    fontSize: 16,
    fontWeight: "600",
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },

  faq: { paddingVertical: spacing.md },
  faqBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  faqHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  faqQ: { flex: 1, color: colors.textSecondary, fontSize: 14, fontWeight: "500" },
  faqA: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: spacing.sm,
  },

  contactBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: spacing.xl,
    paddingVertical: 14,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
  },
  contactBtnText: { color: colors.accentText, fontSize: 16, fontWeight: "700" },
  footnote: {
    color: colors.textDim,
    fontSize: 11,
    textAlign: "center",
    marginTop: spacing.sm,
  },
});
