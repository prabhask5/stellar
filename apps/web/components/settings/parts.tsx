"use client";

import type { ReactNode } from "react";
import { cx } from "@/components/ui/cx";
import { ChevronDownIcon } from "@/components/ui/icons";

/** A titled settings section with an anchor for deep links. */
export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <h2 id={`${id}-title`} className="mb-2 px-1 text-title3">
        {title}
      </h2>
      {description && <p className="mb-3 px-1 text-subhead text-fg-2">{description}</p>}
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** What the closed control shows when the full label is too long for a row. */
  short?: string;
}

/**
 * Native select shown as a trailing value in a list row.
 *
 * What is seen is a plain label, so the control is as wide as the chosen value and no wider;
 * the select itself lies invisible on top of it and still opens the system picker. A bare
 * select is as wide as its longest option (a time zone list makes that most of the row,
 * squeezing the title beside it) and iOS ignores its text alignment.
 */
export function InlineSelect<T extends string>({
  value,
  onChange,
  options,
  label,
  id,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  label: string;
  id?: string;
  className?: string;
}) {
  const chosen = options.find((o) => o.value === value);
  const current = chosen?.label ?? value;
  return (
    <span
      className={cx(
        "relative inline-flex h-11 max-w-[52vw] items-center gap-1 rounded-chip pl-2 pr-1 text-fg-2 hover:text-fg has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent md:max-w-[280px]",
        className,
      )}
    >
      <span aria-hidden className="min-w-0 truncate">
        {chosen?.short ?? current}
      </span>
      <ChevronDownIcon size={14} className="shrink-0" />
      <select
        id={id}
        aria-label={label}
        // The full text of a value too long for the row.
        title={current}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

export const rowInput =
  "h-11 rounded-chip bg-transparent px-2 text-right text-fg-2 outline-none [color-scheme:dark] hover:text-fg focus-visible:outline-2 focus-visible:outline-accent";

/** "Just now", "5 min ago", "3 h ago", "Nov 20". */
export function relativeTime(iso: string, now = Date.now()): string {
  const diff = Math.max(0, now - Date.parse(iso));
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 2) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? "Yesterday" : `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
