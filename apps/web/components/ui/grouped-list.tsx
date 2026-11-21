import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

/** iOS inset-grouped list: one glass container, rows divided by hairlines. */
export function GroupedList({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "glass overflow-hidden rounded-list [&>*+*]:border-t [&>*+*]:border-separator",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface ListRowProps {
  title: ReactNode;
  subtitle?: ReactNode;
  leading?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  href?: string;
  className?: string;
  /** For rows whose control lives in `trailing` (a switch, a select). */
  as?: "div" | "label";
  htmlFor?: string;
}

/** A settings-style row: title, optional subtitle, trailing value or control. Minimum 44px tall. */
export function ListRow({
  title,
  subtitle,
  leading,
  trailing,
  onClick,
  className,
  as = "div",
  htmlFor,
}: ListRowProps) {
  const body = (
    <>
      {leading && <span className="flex shrink-0 items-center text-fg-2">{leading}</span>}
      <span className="min-w-0 flex-1 py-2.5">
        <span className="block truncate text-fg">{title}</span>
        {subtitle && <span className="mt-0.5 block text-footnote text-fg-2">{subtitle}</span>}
      </span>
      {trailing && <span className="flex shrink-0 items-center gap-2 text-fg-2">{trailing}</span>}
    </>
  );
  const base = "flex min-h-[52px] w-full items-center gap-3 px-4 text-left lg:min-h-[48px]";
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={cx(
          base,
          "transition-colors duration-100 hover:bg-fill-hover active:bg-fill-selected",
          className,
        )}
      >
        {body}
      </button>
    );
  }
  if (as === "label") {
    return (
      <label htmlFor={htmlFor} className={cx(base, "cursor-pointer", className)}>
        {body}
      </label>
    );
  }
  return <div className={cx(base, className)}>{body}</div>;
}

export function SectionHeader({
  children,
  action,
  tone = "default",
  className,
}: {
  children: ReactNode;
  action?: ReactNode;
  tone?: "default" | "warning";
  className?: string;
}) {
  return (
    <div className={cx("mb-2 flex min-h-8 items-center justify-between gap-3 px-1", className)}>
      <h2
        className={cx(
          "text-[15px] font-semibold leading-5",
          tone === "warning" ? "text-warning" : "text-fg-2",
        )}
      >
        {children}
      </h2>
      {action}
    </div>
  );
}
