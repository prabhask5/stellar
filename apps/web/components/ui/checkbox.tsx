"use client";

import type { MouseEvent, Ref } from "react";
import { cx } from "./cx";
import { CheckIcon } from "./icons";

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean, element: HTMLButtonElement) => void;
  label: string;
  disabled?: boolean;
  className?: string;
  ref?: Ref<HTMLButtonElement>;
}

/**
 * 22px circle inside a 44px target. Unchecked: 1.5px secondary ring. Checked:
 * fills gold with a check, within one frame of the tap.
 */
export function Checkbox({ checked, onChange, label, disabled, className, ref }: CheckboxProps) {
  const onClick = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onChange(!checked, e.currentTarget);
  };
  return (
    <button
      ref={ref}
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "group flex size-11 shrink-0 items-center justify-center rounded-full disabled:opacity-50",
        className,
      )}
    >
      <span
        className={cx(
          "flex size-[22px] items-center justify-center rounded-full border-[1.5px] transition-transform duration-100 group-active:scale-90",
          checked
            ? "border-accent bg-accent text-accent-ink"
            : "border-fg-2 bg-transparent text-transparent group-hover:border-fg",
        )}
      >
        <CheckIcon size={14} strokeWidth={2.8} className={checked ? "opacity-100" : "opacity-0"} />
      </span>
    </button>
  );
}
