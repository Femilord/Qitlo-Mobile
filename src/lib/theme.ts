/**
 * Design tokens for Qitlo Mobile.
 *
 * Two palettes — dark and light — selected from the device's system
 * appearance (`Appearance.getColorScheme()`) at module load, so the app
 * follows the user's phone setting the way most polished apps do. The dark
 * palette is the app's original look; the light palette mirrors the webapp's
 * light tokens (globals.css `:root`) so the two platforms read consistently.
 *
 * Note: the active palette is resolved once at startup. A live in-app theme
 * picker (switching without relaunch) would require every screen to build its
 * styles reactively rather than at module scope; that's a separate, larger
 * change. Following the system appearance covers the common case with no such
 * refactor. Changing the phone's theme takes effect on the next app launch.
 */

import { Appearance } from "react-native";

export type Palette = {
  bg: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  divider: string;

  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textDim: string;
  textPlaceholder: string;

  accent: string;
  accentText: string;

  error: string;
  errorSurface: string;
  errorBorder: string;

  warningSurface: string;
  warningBorder: string;
  warningText: string;

  successSurface: string;
  successBorder: string;
};

/** Original dark theme (unchanged). */
const dark: Palette = {
  bg: "#0e1620",
  surface: "#172033",
  surfaceElevated: "#1e293b",
  border: "#1e293b",
  divider: "#1e293b",

  textPrimary: "#f8fafc",
  textSecondary: "#cbd5e1",
  textMuted: "#94a3b8",
  textDim: "#64748b",
  textPlaceholder: "#475569",

  accent: "#5eead4",
  accentText: "#0e1620",

  error: "#fca5a5",
  errorSurface: "rgba(244, 63, 94, 0.1)",
  errorBorder: "rgba(244, 63, 94, 0.4)",

  warningSurface: "rgba(251, 191, 36, 0.1)",
  warningBorder: "rgba(251, 191, 36, 0.4)",
  warningText: "#fde68a",

  successSurface: "rgba(94, 234, 212, 0.08)",
  successBorder: "rgba(94, 234, 212, 0.25)",
};

/** Light theme — mirrors the webapp's `:root` tokens. The accent shifts to a
 *  deeper teal (the web brand-600) so it stays legible on white, with white
 *  text on accent-filled buttons. */
const light: Palette = {
  bg: "#f6f8fb",
  surface: "#ffffff",
  surfaceElevated: "#ffffff",
  border: "rgba(15, 18, 24, 0.10)",
  divider: "rgba(15, 18, 24, 0.07)",

  textPrimary: "#0a0c10",
  textSecondary: "#1f2329",
  textMuted: "#5b6470",
  textDim: "#8a929d",
  textPlaceholder: "#aab1bb",

  accent: "#21746a",
  accentText: "#ffffff",

  error: "#b1465e",
  errorSurface: "#fbeef2",
  errorBorder: "rgba(177, 70, 94, 0.40)",

  warningSurface: "#fbf2dc",
  warningBorder: "rgba(176, 112, 36, 0.40)",
  warningText: "#b07024",

  successSurface: "#ecf6f4",
  successBorder: "rgba(47, 138, 124, 0.28)",
};

export const palettes = { light, dark };

/** Whether the app resolved to the light palette this launch. */
export const isLightTheme = Appearance.getColorScheme() === "light";

/** The active palette, chosen from the system appearance at startup.
 *  Defaults to dark when the scheme is unknown/null. */
export const colors: Palette = isLightTheme ? light : dark;

export const radii = {
  sm: 6,
  md: 10,
  lg: 12,
  xl: 16,
  pill: 999,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const fonts = {
  eyebrowSize: 12,
  titleSize: 28,
  subtitleSize: 14,
  bodySize: 14,
  labelSize: 12,
};
