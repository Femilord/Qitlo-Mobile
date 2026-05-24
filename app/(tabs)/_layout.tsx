/**
 * Bottom tab navigation for the authenticated home area.
 *
 * Five tabs matching the webapp's primary surfaces. The Dashboard is the
 * default landing tab (index). Icons use @expo/vector-icons, which ships
 * with Expo SDK — no extra install needed.
 */

import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { colors } from "../../src/lib/theme";

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(name: IconName) {
  return ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} size={size} color={color} />
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: 11, fontWeight: "500" },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: tabIcon("speedometer-outline"),
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: "Journal",
          tabBarIcon: tabIcon("list-outline"),
        }}
      />
      <Tabs.Screen
        name="rules"
        options={{
          title: "Tax Rules",
          tabBarIcon: tabIcon("book-outline"),
        }}
      />
      <Tabs.Screen
        name="debt"
        options={{
          title: "Debt",
          tabBarIcon: tabIcon("card-outline"),
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          title: "Report",
          tabBarIcon: tabIcon("document-text-outline"),
        }}
      />
    </Tabs>
  );
}
