/**
 * Qitlo brand mark — icon + wordmark.
 *
 * The icon is the same circle-with-a-small-tail glyph the webapp draws via
 * `<IconLogo />` in page.tsx (and ships as /public/qitlo.svg). Recreated
 * here with plain RN Views instead of pulling in react-native-svg.
 *
 * Typography matches the webapp's brand block:
 *   - Wordmark: "Qitlo" in Inter 600, letter-spacing tightened slightly to
 *     mirror the webapp's `letter-spacing: -0.01em` on `.brand strong`.
 *   - Subtitle (only on the "lg" size): "US tax planner" in Inter 500.
 *
 * Three sizes:
 *   - "lg" — used on /login and /unlock, splash-style.
 *   - "md" — tab-screen headers (currently unused but available).
 *   - "sm" — small brand strip at the top of the Dashboard.
 */

import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";

import { colors } from "../lib/theme";

type Size = "sm" | "md" | "lg";

const ICON_SIZE: Record<Size, number> = { sm: 18, md: 26, lg: 44 };
const WORDMARK_SIZE: Record<Size, number> = { sm: 17, md: 22, lg: 32 };

// The box is larger than the glyph so the glyph has padding inside, matching
// the webapp's 36px box around a 22px glyph (~1.6x).
const BOX_SIZE: Record<Size, number> = { sm: 30, md: 42, lg: 64 };

/**
 * The webapp's --gradient-brand: linear-gradient(135deg, #2f8a7c 0%,
 * #21746a 60%, #195a52 100%). expo-linear-gradient takes a colors array +
 * matching locations, with start/end describing the 135° (top-left to
 * bottom-right) direction.
 */
const BRAND_GRADIENT = ["#2f8a7c", "#21746a", "#195a52"] as const;
const BRAND_GRADIENT_LOCATIONS = [0, 0.6, 1] as const;

/** The "Q" glyph — the original webapp logo geometry.
 *
 *   <svg viewBox="0 0 24 24">
 *     <circle cx="10" cy="12" r="7" />     ← ring in the left half
 *     <path d="M15 17 L18 14 L21 11" />    ← slash tangent at the lower-
 *                                              right of the ring, extending
 *                                              up-right (a Q-style tail)
 *   </svg>
 *
 * Reproduced here in plain RN Views by scaling those viewbox coordinates
 * to the requested pixel size. The slash is placed by its midpoint (18, 14)
 * and rotated -45° so its endpoints land at (15, 17) and (21, 11), matching
 * the SVG exactly.
 */
export function QitloIcon({
  size = "md",
  color = colors.accent,
}: {
  size?: Size;
  color?: string;
}) {
  const px = ICON_SIZE[size];
  const scale = px / 24;
  // Stroke matches the webapp's 1.6 *viewbox-unit* stroke, scaled to size.
  // (The old `Math.max(1.6, …)` floor made the small size noticeably thicker
  // than the web glyph, which also shrank the apparent ring.)
  const stroke = Math.max(1, 1.6 * scale);

  // Circle: cx=10, cy=12, r=7 in viewbox units.
  const cx = 10 * scale;
  const cy = 12 * scale;
  const r = 7 * scale;
  // Draw the ring with its stroke CENTERED on r (like SVG), not inset
  // border-box. A border-box ring sits at centerline r − stroke/2, i.e. a
  // smaller ring, which made the fixed-length tail poke out past it. Sizing the
  // box to 2r + stroke and offsetting by stroke/2 puts the centerline back on r.
  const ringBox = r * 2 + stroke;

  // Slash from (15, 17) to (21, 11). Midpoint = (18, 14). Length = 6√2.
  // Angle in screen coords (Y down) is -45° → up-right.
  const slashMidX = 18 * scale;
  const slashMidY = 14 * scale;
  const slashLength = 6 * Math.sqrt(2) * scale;

  return (
    <View
      style={{ width: px, height: px, position: "relative" }}
      accessible={false}
    >
      {/* Circle — stroke centered on r (box = 2r + stroke, offset by stroke/2). */}
      <View
        style={{
          position: "absolute",
          left: cx - r - stroke / 2,
          top: cy - r - stroke / 2,
          width: ringBox,
          height: ringBox,
          borderRadius: ringBox / 2,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      {/* Slash — midpoint at (18, 14), rotated -45° so endpoints land at
          (15, 17) and (21, 11). The (15, 17) end sits tangent to the lower-
          right of the circle. */}
      <View
        style={{
          position: "absolute",
          left: slashMidX - slashLength / 2,
          top: slashMidY - stroke / 2,
          width: slashLength,
          height: stroke,
          backgroundColor: color,
          transform: [{ rotate: "-45deg" }],
          borderRadius: stroke / 2,
        }}
      />
    </View>
  );
}

/** The "Qitlo" wordmark in Inter 600. */
export function QitloWordmark({
  size = "md",
  color = colors.textPrimary,
}: {
  size?: Size;
  color?: string;
}) {
  return (
    <Text
      style={[
        styles.wordmark,
        {
          fontSize: WORDMARK_SIZE[size],
          color,
        },
      ]}
      accessibilityRole="header"
      accessibilityLabel="Qitlo"
    >
      Qitlo
    </Text>
  );
}

/** The glyph inside the teal gradient box — matches the webapp's
 *  .brandMark (rounded gradient badge, white glyph, soft shadow). */
export function QitloIconBox({ size = "md" }: { size?: Size }) {
  const box = BOX_SIZE[size];
  // Glyph sits at ~62% of the box, leaving even padding (mirrors the
  // webapp's 22px glyph in a 36px box).
  const glyphSize: Size = size;
  return (
    <LinearGradient
      colors={BRAND_GRADIENT}
      locations={BRAND_GRADIENT_LOCATIONS}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.box,
        {
          width: box,
          height: box,
          borderRadius: box * 0.26,
        },
      ]}
    >
      <QitloIcon size={glyphSize} color="#ffffff" />
    </LinearGradient>
  );
}

/** Icon-in-box + wordmark, with an optional subtitle. The canonical brand
 *  block, standardized with the webapp's boxed treatment. */
export function QitloLogo({
  size = "md",
  wordmarkColor = colors.textPrimary,
  withSubtitle,
  animating = false,
}: {
  size?: Size;
  wordmarkColor?: string;
  /** Show "US tax planner" beneath the wordmark. Defaults to true at "lg"
   *  size, false otherwise — matches the webapp's sidebar treatment. */
  withSubtitle?: boolean;
  /** When true, the logo runs a subtle "breathing" pulse (gentle scale +
   *  opacity loop). Used on the login/unlock plain background while the auth
   *  request is in flight, so the brand mark itself signals "working". */
  animating?: boolean;
}) {
  const showSubtitle = withSubtitle ?? size === "lg";
  const gap = size === "lg" ? 14 : size === "md" ? 10 : 8;

  // 0 = rest, 1 = peak of the breath. Driven on the native thread.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!animating) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 750,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animating, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.6] });

  return (
    <Animated.View
      style={[styles.row, { gap, transform: [{ scale }], opacity }]}
      accessibilityState={{ busy: animating }}
    >
      <QitloIconBox size={size} />
      <View>
        <QitloWordmark size={size} color={wordmarkColor} />
        {showSubtitle && (
          <Text style={[styles.subtitle, size === "lg" && styles.subtitleLg]}>
            US tax planner
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  box: {
    alignItems: "center",
    justifyContent: "center",
    // Soft elevation matching the webapp's brandMark box-shadow.
    shadowColor: "#0f1218",
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  wordmark: {
    // Inter 600 — matches the webapp's `font-display` + `font-weight: 600`
    // on the `.brand strong` element.
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.3,
    // Slightly tighter line height so the wordmark + subtitle hug together.
    lineHeight: undefined,
  },
  subtitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  subtitleLg: {
    fontSize: 13,
    marginTop: 3,
  },
});
