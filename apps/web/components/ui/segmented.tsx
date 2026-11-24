"use client";

import { haptic } from "@/lib/client/haptics";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { useId } from "react";
import { cx } from "./cx";

export interface Segment<T extends string> {
  value: T;
  label: string;
  /** Extra text for screen readers. */
  hint?: string;
}

export interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly Segment<T>[];
  label: string;
  size?: "sm" | "md";
  className?: string;
  /** Segments share the width equally (default) or hug their labels. */
  fit?: "equal" | "content";
}

const SPRING = { type: "spring", stiffness: 400, damping: 32 } as const;

/** iOS-style segmented control with a spring-animated thumb. Arrow keys move the selection. */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  size = "md",
  className,
  fit = "equal",
}: SegmentedControlProps<T>) {
  const id = useId();
  const reduce = useReducedMotion();
  const index = options.findIndex((o) => o.value === value);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const delta =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!delta) return;
    e.preventDefault();
    const next = options[(index + delta + options.length) % options.length];
    if (next) onChange(next.value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cx(
        "glass relative inline-flex rounded-button p-[3px]",
        fit === "equal" ? "w-full" : "w-auto",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.hint ? `${o.label}, ${o.hint}` : undefined}
            tabIndex={active ? 0 : -1}
            onClick={() => {
              if (!active) haptic();
              onChange(o.value);
            }}
            className={cx(
              "relative z-10 flex items-center justify-center whitespace-nowrap rounded-thumb font-medium transition-colors duration-200",
              size === "md" ? "h-[38px] text-[15px] lg:h-[34px] lg:text-[14px]" : "h-8 text-[13px]",
              // Segments share the leftover width but never shrink below their label ("Calendar" on small phones).
              fit === "equal" ? "min-w-0 flex-auto px-2" : "px-4",
              active ? "text-fg" : "text-fg-2 hover:text-fg",
            )}
          >
            {active && (
              <m.span
                layoutId={`${id}-thumb`}
                transition={reduce ? { duration: 0 } : SPRING}
                className="absolute inset-0 -z-10 rounded-thumb bg-fill-thumb shadow-[0_1px_2px_rgba(0,0,0,0.25)]"
              />
            )}
            <span className="truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
