/**
 * Avatar store — keeps the user's chosen profile photo and exposes actions to
 * pick a new one or clear it.
 *
 * The photo is a device-local concern (not part of the synced encrypted blob),
 * so it lives in AsyncStorage keyed by user id, and the picked file is copied
 * into the app's document directory so it survives cache eviction.
 *
 * expo-image-picker is loaded lazily (require) so the app still runs — showing
 * the initials avatar — even before the native module is installed. If it's
 * missing, "change photo" shows a one-line setup hint instead of crashing.
 *
 * To enable photo upload, install the picker:
 *     npx expo install expo-image-picker
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

import { useAppState } from "./appState";

type AvatarContextValue = {
  /** Local file:// URI of the current photo, or null for initials fallback. */
  uri: string | null;
  loading: boolean;
  /** Open the photo library, let the user pick + crop, and persist it. */
  pickAndSet: () => Promise<void>;
  /** Remove the photo and revert to initials. */
  remove: () => Promise<void>;
};

const AvatarContext = createContext<AvatarContextValue | null>(null);

const keyFor = (id?: string | null) => `qitlo.avatar.${id ?? "anon"}`;

export function AvatarProvider({ children }: { children: ReactNode }) {
  const { user } = useAppState();
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load the stored photo whenever the signed-in user changes.
  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      try {
        const stored = await AsyncStorage.getItem(keyFor(user?.id));
        if (active) setUri(stored);
      } catch {
        if (active) setUri(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const pickAndSet = useCallback(async () => {
    // Lazy-load the native module so a missing install degrades gracefully.
    let ImagePicker: typeof import("expo-image-picker");
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ImagePicker = require("expo-image-picker");
    } catch {
      Alert.alert(
        "One step to enable photos",
        "Run `npx expo install expo-image-picker`, then restart the app to upload a profile picture.",
      );
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(
        "Photo access needed",
        "Allow photo-library access in Settings to set a profile picture.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;

    const src = result.assets[0].uri;
    try {
      // Copy into a persistent, app-owned location. The picker URI can point
      // at a cache that the OS may clear.
      const dir = `${FileSystem.documentDirectory}avatars/`;
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
      const dest = `${dir}avatar-${user?.id ?? "anon"}-${Date.now()}.jpg`;
      await FileSystem.copyAsync({ from: src, to: dest });
      await AsyncStorage.setItem(keyFor(user?.id), dest);
      setUri(dest);
    } catch {
      // If the copy fails for any reason, fall back to the original URI so the
      // user still sees their photo this session.
      await AsyncStorage.setItem(keyFor(user?.id), src);
      setUri(src);
    }
  }, [user?.id]);

  const remove = useCallback(async () => {
    await AsyncStorage.removeItem(keyFor(user?.id));
    setUri(null);
  }, [user?.id]);

  return (
    <AvatarContext.Provider value={{ uri, loading, pickAndSet, remove }}>
      {children}
    </AvatarContext.Provider>
  );
}

export function useAvatar(): AvatarContextValue {
  const ctx = useContext(AvatarContext);
  if (!ctx) {
    throw new Error("useAvatar must be used within an <AvatarProvider>.");
  }
  return ctx;
}
