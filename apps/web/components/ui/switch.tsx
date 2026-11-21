"use client";

import { cx } from "./cx";

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  id?: string;
  disabled?: boolean;
}

/** iOS-style toggle. */
export function Switch({ checked, onChange, label, id, disabled }: SwitchProps) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors duration-200 disabled:opacity-50",
        checked ? "bg-accent" : "bg-white/15",
      )}
    >
      <span
        className={cx(
          "absolute left-[2px] top-[2px] size-[27px] rounded-full bg-white shadow-[0_2px_4px_rgba(0,0,0,0.3)] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
          checked && "translate-x-5",
        )}
      />
    </button>
  );
}
