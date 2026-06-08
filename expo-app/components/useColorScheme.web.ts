import { useState, useEffect, useCallback } from "react";

// Shared state so all components using this hook stay in sync
let _scheme: "light" | "dark" = "light";
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach((fn) => fn());
}

/**
 * Web-specific useColorScheme that supports toggling.
 * Reads from localStorage on first load, falls back to system preference.
 */
export function useColorScheme(): "light" | "dark" {
  const [, forceRender] = useState(0);

  useEffect(() => {
    // Initialize from localStorage or system preference on mount
    const saved = localStorage.getItem("blab-theme");
    if (saved === "dark" || saved === "light") {
      _scheme = saved;
    } else {
      _scheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    forceRender((n) => n + 1);

    const listener = () => forceRender((n) => n + 1);
    _listeners.add(listener);
    return () => { _listeners.delete(listener); };
  }, []);

  return _scheme;
}

/**
 * Toggle between light and dark mode.
 */
export function toggleColorScheme() {
  _scheme = _scheme === "dark" ? "light" : "dark";
  localStorage.setItem("blab-theme", _scheme);
  _notify();
}
