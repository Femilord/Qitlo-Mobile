/**
 * Avatar — a circular user badge.
 *
 * Renders the user's uploaded photo when one is set; otherwise falls back to
 * their initials on the brand-teal surface. This is the standardized avatar
 * used everywhere in the app (top bar, account screen, user menu header).
 *
 * Initials are derived from the display name first, then the email local-part
 * — e.g. "Femi Lord" → "FL", "femilord@gmail.com" → "FE".
 */

import { Image, StyleSheet, Text, View } from "react-native";

import { colors } from "../lib/theme";

/** Derive 1–2 uppercase initials from a name or, failing that, an email. */
export function initialsFrom(name?: string | null, email?: string | null): string {
  const source = (name && name.trim()) || (email ? email.split("@")[0] : "");
  if (!source) return "?";
  const parts = source
    .replace(/[._\-+]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  size = 36,
  uri,
  name,
  email,
  ring = true,
}: {
  /** Diameter in px. */
  size?: number;
  /** Local file:// URI of the uploaded photo, if any. */
  uri?: string | null;
  name?: string | null;
  email?: string | null;
  /** Draw a subtle border ring around the badge. */
  ring?: boolean;
}) {
  const radius = size / 2;
  const fontSize = Math.round(size * 0.4);

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: radius,
          borderWidth: ring ? 1 : 0,
        },
      ]}
      accessibilityRole="image"
      accessibilityLabel="Profile picture"
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
        />
      ) : (
        <Text style={[styles.initials, { fontSize }]}>
          {initialsFrom(name, email)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    backgroundColor: colors.successSurface,
    borderColor: colors.successBorder,
  },
  initials: {
    color: colors.accent,
    fontFamily: "Inter_600SemiBold",
    fontWeight: "600",
  },
});
