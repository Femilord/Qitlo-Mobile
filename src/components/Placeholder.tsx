/**
 * Reusable placeholder for not-yet-built tab screens. Keeps every tab
 * functional during phased rollout — tapping a tab never lands on a blank.
 */

import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, radii, spacing } from "../lib/theme";
import { AppHeader } from "./AppHeader";

export function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <AppHeader />
      <View style={styles.container}>
        <Text style={styles.eyebrow}>Coming soon</Text>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.card}>
          <Text style={styles.body}>{body}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: spacing.xl, paddingTop: spacing.xxl },
  eyebrow: {
    color: colors.accent,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  title: { color: colors.textPrimary, fontSize: 28, fontWeight: "700" },
  card: {
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: spacing.lg,
  },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 22 },
});
