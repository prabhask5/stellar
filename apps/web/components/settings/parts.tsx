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
}

/** Native select styled as a trailing value in a list row. */
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
  return (
    <span
      className={cx("relative inline-flex max-w-[60vw] items-center md:max-w-[280px]", className)}
    >
      <select
        id={id}
        aria-label={label}
        // The full text of a value too long for the row.
        title={options.find((o) => o.value === value)?.label}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        className="h-11 w-full cursor-pointer appearance-none truncate rounded-chip bg-transparent pl-2 pr-7 text-right text-fg-2 outline-none hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon size={14} className="pointer-events-none absolute right-1.5 text-fg-2" />
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
