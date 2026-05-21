"use client";

import type { ButtonHTMLAttributes } from "react";

interface PrimaryActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: "filled" | "outline";
}

export function PrimaryActionButton({
  label,
  variant = "filled",
  className = "",
  ...rest
}: PrimaryActionButtonProps) {
  const base = "w-full rounded-md px-4 py-2.5 text-sm font-medium transition-opacity disabled:opacity-40 disabled:cursor-not-allowed";
  const filled = "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:opacity-90";
  const outline = "border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:border-[hsl(var(--foreground))] transition-colors";
  const variantClass = variant === "filled" ? filled : outline;
  return (
    <button className={`${base} ${variantClass} ${className}`.trim()} {...rest}>
      {label}
    </button>
  );
}
