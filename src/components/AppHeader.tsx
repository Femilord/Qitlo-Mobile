/**
 * AppHeader — the standardized top bar shown across the app.
 *
 *   ┌───────────────────────────────────────────────┐
 *   │                                        (FL)    │
 *   └───────────────────────────────────────────────┘
 *
 * Just the user's avatar on the right — the brand logo is intentionally NOT in
 * the in-app shell; it lives only on the login/unlock plain background. Tapping
 * the avatar opens a dropdown "user menu" — the same bare-avatar pattern as
 * Instagram / X / Gmail on mobile — anchored under the avatar at the top-right.
 * The bar is pinned (it lives outside each screen's scroll view) and opaque, so
 * content scrolls cleanly beneath it rather than behind it.
 *
 * Menu contents (per product spec):
 *   • Identity header (avatar + name/email) with a "change photo" affordance
 *   • Account & backup        → /account
 *   • Help & support          → /help
 *   • Sign out                (destructive, with confirm)
 *
 * The photo itself is managed by the AvatarProvider (src/lib/avatar.tsx).
 */

import { useState, type ReactNode } from "react";
import {
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { unreadCount } from "qitlo-shared";

import { useAppState } from "../lib/appState";
import { useAvatar } from "../lib/avatar";
import { colors, radii, spacing } from "../lib/theme";
import { Avatar } from "./Avatar";

export function AppHeader({ left }: { left?: ReactNode } = {}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, blob, signOut } = useAppState();
  const { uri, pickAndSet, remove } = useAvatar();

  const [open, setOpen] = useState(false);

  function openMenu() {
    setOpen(true);
  }
  function closeMenu() {
    setOpen(false);
  }

  // Display name lives in the webapp's user object, preserved in passthrough.
  const passUser =
    (blob?.data.passthrough.user as { name?: string } | undefined) ?? undefined;
  const displayName = passUser?.name?.trim() || "";
  const email = user?.email ?? "";

  const unread = blob ? unreadCount(blob.data.notifications) : 0;

  function go(path: "/account" | "/help") {
    closeMenu();
    // Let the dropdown dismiss before pushing the modal route.
    setTimeout(() => router.push(path), 10);
  }

  function onChangePhoto() {
    if (uri) {
      Alert.alert("Profile photo", undefined, [
        { text: "Choose new photo", onPress: () => void pickAndSet() },
        { text: "Remove photo", style: "destructive", onPress: () => void remove() },
        { text: "Cancel", style: "cancel" },
      ]);
    } else {
      void pickAndSet();
    }
  }

  function onSignOut() {
    closeMenu();
    Alert.alert(
      "Sign out?",
      "Your data stays safe on the server. You'll need your password to sign back in.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign out",
          style: "destructive",
          onPress: async () => {
            await signOut();
            router.dismissAll?.();
            router.replace("/login");
          },
        },
      ],
    );
  }

  return (
    <>
      <View style={styles.bar}>
        {/* Left slot — e.g. the Dashboard's scroll-aware brand logo. Empty
            (logo-less) on every other screen. */}
        <View style={styles.barLeft}>{left}</View>
        {/* Right group — pinned bell + avatar, shared across all screens. */}
        <View style={styles.barRight}>
          <Pressable
            onPress={() => router.push("/notifications")}
            hitSlop={10}
            style={({ pressed }) => [styles.bellBtn, pressed && styles.avatarBtnActive]}
            accessibilityRole="button"
            accessibilityLabel={
              unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
            }
          >
            <Ionicons name="notifications-outline" size={22} color={colors.textSecondary} />
            {unread > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unread > 9 ? "9+" : unread}</Text>
              </View>
            )}
          </Pressable>
          <Pressable
            onPress={openMenu}
            hitSlop={10}
            style={({ pressed }) => [
              styles.avatarBtn,
              (pressed || open) && styles.avatarBtnActive,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Open account menu"
            accessibilityState={{ expanded: open }}
          >
            <Avatar size={32} uri={uri} name={displayName} email={email} />
          </Pressable>
        </View>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={closeMenu}
      >
        {/* Tap-anywhere backdrop dismisses the menu. */}
        <Pressable style={styles.backdrop} onPress={closeMenu} />

        <View
          style={[
            styles.menu,
            { top: insets.top + 52, right: spacing.xl },
          ]}
        >
          {/* Identity header — tap the avatar to change the photo. */}
          <View style={styles.identity}>
            <Pressable
              onPress={onChangePhoto}
              hitSlop={6}
              style={styles.identityAvatar}
              accessibilityLabel="Change profile photo"
            >
              <Avatar size={44} uri={uri} name={displayName} email={email} />
              <View style={styles.cameraBadge}>
                <Ionicons name="camera" size={11} color={colors.accentText} />
              </View>
            </Pressable>
            <View style={styles.identityText}>
              <Text style={styles.identityName} numberOfLines={1}>
                {displayName || "Your account"}
              </Text>
              <Text style={styles.identityEmail} numberOfLines={1}>
                {email}
              </Text>
              <Pressable onPress={onChangePhoto} hitSlop={6}>
                <Text style={styles.changePhoto}>
                  {uri ? "Edit photo" : "Add photo"}
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.divider} />

          <MenuItem
            icon="person-circle-outline"
            label="Account & backup"
            onPress={() => go("/account")}
          />
          <MenuItem
            icon="help-circle-outline"
            label="Help & support"
            onPress={() => go("/help")}
          />

          <View style={styles.divider} />

          <MenuItem
            icon="log-out-outline"
            label="Sign out"
            onPress={onSignOut}
            destructive
          />
        </View>
      </Modal>
    </>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  destructive,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  destructive?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && styles.itemPressed]}
      accessibilityRole="button"
    >
      <Ionicons
        name={icon}
        size={19}
        color={destructive ? colors.error : colors.textSecondary}
      />
      <Text style={[styles.itemLabel, destructive && styles.itemLabelDanger]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    // Optional left slot (logo) vs. the pinned bell + avatar group on the right.
    justifyContent: "space-between",
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    // Opaque so scrolling content disappears cleanly beneath the bar.
    backgroundColor: colors.bg,
  },
  // Keeps the bar height stable even when the left slot is empty or its
  // contents fade/translate, so the bell + avatar never shift.
  barLeft: { flexShrink: 1, minHeight: 32, justifyContent: "center" },
  barRight: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  bellBtn: {
    padding: 6,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "transparent",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 3,
    borderRadius: 8,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.bg,
  },
  badgeText: { color: "#3b0a0a", fontSize: 10, fontWeight: "800" },
  avatarBtn: {
    padding: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: "transparent",
  },
  avatarBtnActive: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },

  backdrop: { ...StyleSheet.absoluteFillObject },

  menu: {
    position: "absolute",
    minWidth: 248,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    // Float the menu above the surface.
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 12,
  },

  identity: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  identityAvatar: { position: "relative" },
  cameraBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.surfaceElevated,
  },
  identityText: { flex: 1, gap: 1 },
  identityName: { color: colors.textPrimary, fontSize: 15, fontWeight: "600" },
  identityEmail: { color: colors.textMuted, fontSize: 12 },
  changePhoto: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: "600",
    marginTop: 3,
  },

  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: 4,
    marginHorizontal: spacing.sm,
  },

  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radii.md,
    marginHorizontal: 4,
  },
  itemPressed: { backgroundColor: colors.surface },
  itemLabel: { color: colors.textSecondary, fontSize: 15, fontWeight: "500" },
  itemLabelDanger: { color: colors.error },
});
