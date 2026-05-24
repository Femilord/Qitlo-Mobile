/**
 * Root layout — wraps the whole app in the AppState provider, the safe-area
 * provider, and a status bar. The auth gate (which screen to show based on
 * status) lives in app/index.tsx and the individual route files; this layout
 * just renders <Stack> so any child route can declare itself.
 */

import "react-native-get-random-values";

import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from "@expo-google-fonts/inter";

import { AppStateProvider, useAppState } from "../src/lib/appState";
import { AvatarProvider } from "../src/lib/avatar";
import { QitloLogo } from "../src/components/QitloLogo";
import { colors } from "../src/lib/theme";

/** Drives navigation based on auth status. Runs as a hook inside the
 *  provider so it can read status; redirects when status flips.
 *
 *  Logic intent:
 *    - no_session  → only /login is allowed; anywhere else, kick to /login.
 *    - locked      → only /unlock is allowed.
 *    - unlocked    → anywhere EXCEPT /login and /unlock. Tabs, modals
 *                     (e.g., /entry), future routes (/profile, /settings)
 *                     are all fine.
 *
 *  Earlier this gate forced "unlocked" users back to /(tabs) whenever the
 *  current route wasn't a tab — which broke modal routes like /entry by
 *  bouncing them back to the Dashboard the moment they opened. */
function AuthGate() {
  const { status } = useAppState();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === "loading") return;
    const first = segments[0];

    if (status === "no_session") {
      if (first !== "login") router.replace("/login");
    } else if (status === "locked") {
      if (first !== "unlock") router.replace("/unlock");
    } else if (status === "unlocked") {
      // Only kick the user away from auth-only screens. Any other route
      // (tabs, modals, future screens) is fine.
      if (first === "login" || first === "unlock") {
        router.replace("/");
      }
    }
  }, [status, segments, router]);

  return null;
}

/** Returns true once `ms` has elapsed since mount. Used to hold the launch
 *  splash on screen long enough to actually be seen. */
function useMinimumDelay(ms: number): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return done;
}

/** Launch / boot splash overlay. Renders the brand mark on the plain
 *  background and lets it "breathe" while the app initializes — a seamless
 *  continuation of the native splash image. It sits ON TOP of the (already
 *  mounted) navigator so AuthGate can route underneath while the splash is up,
 *  then fades out once the app is ready. */
function BootSplash() {
  return (
    <View style={styles.splash}>
      <QitloLogo size="lg" animating />
    </View>
  );
}

function RootStack() {
  const { status } = useAppState();
  // Hold the splash for at least ~1.2s so the animated logo is perceptible,
  // even when session-restore resolves almost instantly (logged-out cold
  // start is just a local token read with no network).
  const minElapsed = useMinimumDelay(1200);
  const showSplash = status === "loading" || !minElapsed;

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "fade",
        }}
      >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="unlock" />
      <Stack.Screen
        name="entry"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="profile"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="debt-entry"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="account"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="help"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="limits"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      <Stack.Screen
        name="notifications"
        options={{ presentation: "modal", animation: "slide_from_bottom" }}
      />
      </Stack>
      {showSplash && <BootSplash />}
    </>
  );
}

export default function RootLayout() {
  // Inter ships from the webapp's design tokens (--font-display). Loading
  // it here means the Qitlo wordmark (and any other Inter-styled text)
  // renders with the same letter shapes on the phone and the web. While
  // loading, render the dark splash background to avoid a font-swap flash.
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={styles.center}>
        <QitloLogo size="lg" animating />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <AppStateProvider>
        <AvatarProvider>
          <AuthGate />
          <RootStack />
          <StatusBar style="auto" />
        </AvatarProvider>
      </AppStateProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
  },
  // Full-screen launch splash overlay (sits above the navigator).
  splash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.bg,
    justifyContent: "center",
    alignItems: "center",
  },
});
