/**
 * Notifications center — modal route at /notifications.
 *
 * Shows the synced notification inbox (blob.notifications): spending warnings,
 * limit-reached alerts, backup reminders, and sync events. Opening the screen
 * marks everything read (clearing the bell badge). Each item can be dismissed,
 * or the whole list cleared. Read/cleared state is stored on the blob, so it
 * reflects on the web app too.
 */

import { useEffect, useRef } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import {
  visibleNotifications,
  unreadCount,
  markAllRead,
  clearOne,
  clearAll,
  relativeTime,
  type AppNotification,
} from "qitlo-shared";
import { useAppState, type AppBlob } from "../src/lib/appState";
import { colors, radii, spacing } from "../src/lib/theme";

export default function NotificationsScreen() {
  const router = useRouter();
  const { blob, updateBlob } = useAppState();

  const all = blob?.data.notifications ?? [];
  const visible = visibleNotifications(all);

  // Mark everything read once, when the screen opens.
  const markedRef = useRef(false);
  useEffect(() => {
    if (markedRef.current || !blob) return;
    markedRef.current = true;
    if (unreadCount(blob.data.notifications) > 0) {
      const next: AppBlob = {
        ...blob.data,
        notifications: markAllRead(blob.data.notifications),
      };
      void updateBlob(next);
    }
  }, [blob, updateBlob]);

  function dismiss(id: string) {
    if (!blob) return;
    const next: AppBlob = {
      ...blob.data,
      notifications: clearOne(blob.data.notifications, id),
    };
    void updateBlob(next);
  }

  function dismissAll() {
    if (!blob) return;
    const next: AppBlob = {
      ...blob.data,
      notifications: clearAll(blob.data.notifications),
    };
    void updateBlob(next);
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.headerBtn}>
          <Text style={styles.headerBtnText}>Done</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <Pressable
          onPress={dismissAll}
          hitSlop={12}
          style={styles.headerBtn}
          disabled={visible.length === 0}
        >
          <Text
            style={[
              styles.headerBtnText,
              styles.headerBtnPrimary,
              visible.length === 0 && styles.headerBtnDisabled,
            ]}
          >
            Clear all
          </Text>
        </Pressable>
      </View>

      {visible.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-off-outline" size={40} color={colors.textDim} />
          <Text style={styles.emptyTitle}>You&apos;re all caught up</Text>
          <Text style={styles.emptyText}>
            Spending alerts, backup reminders, and sync updates will show up here.
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {visible.map((n) => (
            <NotificationRow key={n.id} item={n} onDismiss={() => dismiss(n.id)} />
          ))}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function NotificationRow({
  item,
  onDismiss,
}: {
  item: AppNotification;
  onDismiss: () => void;
}) {
  const { icon, tint } = iconFor(item.kind);
  return (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: `${tint}22` }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{item.title}</Text>
        <Text style={styles.rowText}>{item.body}</Text>
        <Text style={styles.rowTime}>{relativeTime(item.createdAt)}</Text>
      </View>
      <Pressable onPress={onDismiss} hitSlop={10} style={styles.dismissBtn}>
        <Ionicons name="close" size={16} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

function iconFor(kind: AppNotification["kind"]): {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
} {
  switch (kind) {
    case "spendingOver":
      return { icon: "alert-circle", tint: colors.error };
    case "spendingWarn":
      return { icon: "warning-outline", tint: colors.warningText };
    case "backupReminder":
      return { icon: "cloud-upload-outline", tint: colors.accent };
    case "syncConflict":
      return { icon: "sync-outline", tint: colors.accent };
    case "info":
    default:
      return { icon: "information-circle-outline", tint: colors.textMuted };
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xxl + 32 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBtn: { minWidth: 70, paddingVertical: 4 },
  headerBtnText: { color: colors.textMuted, fontSize: 16 },
  headerBtnPrimary: { color: colors.accent, fontWeight: "600", textAlign: "right" },
  headerBtnDisabled: { color: colors.textDim },
  headerTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: 8 },
  emptyTitle: { color: colors.textPrimary, fontSize: 16, fontWeight: "600", marginTop: 6 },
  emptyText: { color: colors.textMuted, fontSize: 13, textAlign: "center", lineHeight: 19 },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, gap: 3 },
  rowTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: "600" },
  rowText: { color: colors.textSecondary, fontSize: 13, lineHeight: 18 },
  rowTime: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  dismissBtn: { padding: 2 },
});
