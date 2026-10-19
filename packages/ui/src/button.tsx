import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const styles: Record<Variant, string> = {
  primary:
    "bg-[var(--lo-accent)] text-[var(--lo-accent-fg)] hover:brightness-110",
  secondary:
    "bg-[var(--lo-surface-elevated)] text-[var(--lo-fg)] border border-[var(--lo-border)] hover:bg-[var(--lo-surface)]",
  ghost: "bg-transparent text-[var(--lo-fg-muted)] hover:text-[var(--lo-fg)]",
};

export function Button({
  children,
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: Variant;
}) {
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition disabled:opacity-50 ${styles[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
