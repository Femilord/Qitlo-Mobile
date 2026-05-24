/**
 * Design tokens for Qitlo Mobile.
 *
 * Matches the webapp's dark theme (the "Dark" aesthetic in globals.css)
 * roughly. Light theme parity comes in Phase 6. Centralized so every screen
 * pulls from the same palette and a future ThemeProvider can swap it.
 */

export const colors = {
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
