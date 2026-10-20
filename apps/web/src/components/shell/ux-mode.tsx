"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { UxMode } from "@leadorbit/domain";

const COOKIE = "lo_ux_mode";

type Ctx = {
  mode: UxMode;
  setMode: (mode: UxMode) => void;
};

const UxModeContext = createContext<Ctx | null>(null);

function readCookie(): UxMode {
  if (typeof document === "undefined") return "simple";
  const match = document.cookie.match(/(?:^|; )lo_ux_mode=([^;]*)/);
  const v = match?.[1];
  if (v === "advanced" || v === "expert" || v === "simple") return v;
  return "simple";
}

export function UxModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<UxMode>("simple");

  useEffect(() => {
    setModeState(readCookie());
  }, []);

  function setMode(next: UxMode) {
    setModeState(next);
    document.cookie = `${COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }

  return (
    <UxModeContext.Provider value={{ mode, setMode }}>{children}</UxModeContext.Provider>
  );
}

export function useUxMode() {
  const ctx = useContext(UxModeContext);
  if (!ctx) throw new Error("useUxMode requires UxModeProvider");
  return ctx;
}

export function ModeSwitcher() {
  const { mode, setMode } = useUxMode();
  const modes: UxMode[] = ["simple", "advanced", "expert"];
  return (
    <div
      className="lo-mode-switch"
      role="group"
      aria-label="Experience depth"
    >
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          className={mode === m ? "is-active" : undefined}
          onClick={() => setMode(m)}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
