import { useEffect, useState } from "react";

const STORAGE_KEY = "gazelle.tweaks";

export function useTweaks(defaults) {
  const [t, setT] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch {
      return defaults;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(t));
    } catch {
      // localStorage may be unavailable (private mode); ignore.
    }
  }, [t]);
  const setTweak = (k, v) => setT((prev) => ({ ...prev, [k]: v }));
  return [t, setTweak];
}
