import { useState, useEffect } from "react";
import { useColorScheme as useColorSchemeCore, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

let _scheme: "light" | "dark" = "light";
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach((fn) => fn());
}

export const useColorScheme = (): "light" | "dark" => {
  const coreScheme = useColorSchemeCore();
  const [, forceRender] = useState(0);

  useEffect(() => {
    const loadTheme = async () => {
      let saved: string | null = null;
      try {
        saved = await SecureStore.getItemAsync("blab-theme");
      } catch {}

      if (saved === "dark" || saved === "light") {
        _scheme = saved;
      } else {
        _scheme = coreScheme === "dark" ? "dark" : "light";
      }
      _notify();
    };

    loadTheme();

    const listener = () => forceRender((n) => n + 1);
    _listeners.add(listener);
    return () => {
      _listeners.delete(listener);
    };
  }, [coreScheme]);

  return _scheme;
};

export async function toggleColorScheme() {
  _scheme = _scheme === "dark" ? "light" : "dark";
  try {
    await SecureStore.setItemAsync("blab-theme", _scheme);
  } catch {}
  _notify();
}
