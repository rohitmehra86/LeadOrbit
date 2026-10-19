import type { ReactNode } from "react";

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-[var(--lo-border)] bg-[var(--lo-surface-elevated)] px-2 py-0.5 text-xs font-medium text-[var(--lo-fg-muted)]">
      {children}
    </span>
  );
}
