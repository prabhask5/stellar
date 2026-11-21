import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";
import { cx } from "./cx";

export interface ChipProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Gold-tinted when active (a value is set, or the option is on). */
  active?: boolean;
  icon?: ReactNode;
  size?: "sm" | "md";
  ref?: Ref<HTMLButtonElement>;
}

/** Pill-ish button used for quick-add options, weekday toggles and block-list toggles. */
export function Chip({
  active,
  icon,
  size = "md",
  className,
  children,
  type = "button",
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={rest["aria-pressed"] ?? active}
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-chip border font-medium",
        "transition-[transform,background-color,border-color,color] duration-100 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100",
        size === "md" ? "h-9 px-3 text-[14px]" : "h-8 px-2.5 text-[13px]",
        active
          ? "border-accent-line bg-accent-soft text-accent"
          : "border-hairline bg-fill-subtle text-fg-2 hover:bg-fill-selected hover:text-fg",
        className,
      )}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}
