"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import type { AppFrameProps } from "./app-frame";

type ShellState = Omit<AppFrameProps, "children">;
type ShellStateContextValue = {
  shell: ShellState | null;
  remember: (shell: ShellState) => void;
  forget: () => void;
};

const AppShellStateContext = createContext<ShellStateContextValue | null>(null);

export function AppShellStateProvider({ children }: { children: ReactNode }) {
  const [shell, remember] = useState<ShellState | null>(null);
  const forget = useCallback(() => remember(null), []);
  const value = useMemo(() => ({ shell, remember, forget }), [forget, shell]);
  return <AppShellStateContext.Provider value={value}>{children}</AppShellStateContext.Provider>;
}

export function RememberAppShell({ shell }: { shell: ShellState }) {
  const context = useContext(AppShellStateContext);
  useEffect(() => context?.remember(shell), [context, shell]);
  return null;
}

export function useRememberedAppShell() {
  return useContext(AppShellStateContext)?.shell ?? null;
}

export function useForgetAppShell() {
  return useContext(AppShellStateContext)?.forget ?? (() => undefined);
}
