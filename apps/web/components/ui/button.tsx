import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "tinted";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Adds the gold glow. Use on the single primary action of a view. */
  glow?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink font-semibold hover:brightness-105",
  secondary: "bg-fill-subtle text-fg border border-hairline hover:bg-fill-selected",
  ghost: "text-accent hover:bg-fill-hover",
  danger:
    "bg-[rgba(255,122,138,0.12)] text-danger border border-[rgba(255,122,138,0.28)] hover:bg-[rgba(255,122,138,0.18)]",
  tinted: "bg-accent-soft text-accent border border-accent-line hover:bg-[rgba(246,199,110,0.2)]",
};

const SIZE: Record<Size, string> = {
  sm: "h-9 px-3 text-[14px] rounded-chip gap-1.5",
  md: "h-11 px-4 text-[15px] rounded-button gap-2",
  lg: "h-[52px] px-6 text-[17px] rounded-[14px] gap-2",
};

/** Springy press (scale 0.97), 44px minimum target at md and above. */
export function Button({
  variant = "secondary",
  size = "md",
  glow,
  loading,
  icon,
  block,
  className,
  children,
  disabled,
  type = "button",
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        "relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-medium",
        "transition-[transform,background-color,filter,opacity] duration-100 ease-out active:scale-[0.97]",
        "disabled:opacity-45 disabled:active:scale-100",
        VARIANT[variant],
        SIZE[size],
        size === "sm" && "min-h-9",
        glow && "glow",
        block && "w-full",
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
}

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={cx("animate-spin", className)}
      role="status"
      aria-label="Loading"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2.5"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: icon buttons have no visible text. */
  label: string;
  variant?: "glass" | "plain" | "subtle";
  size?: number;
  ref?: Ref<HTMLButtonElement>;
}

/** Round icon button with a 44px target and an accessible label. */
export function IconButton({
  label,
  variant = "glass",
  size = 44,
  className,
  children,
  type = "button",
  ...rest
}: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      style={{ width: size, height: size }}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full text-fg",
        "transition-[transform,background-color,color] duration-100 ease-out active:scale-[0.94] disabled:opacity-40",
        variant === "glass" && "glass hover:bg-[rgba(40,34,84,0.6)]",
        variant === "subtle" && "bg-fill-subtle border border-hairline hover:bg-fill-selected",
        variant === "plain" && "text-fg-2 hover:bg-fill-hover hover:text-fg",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
