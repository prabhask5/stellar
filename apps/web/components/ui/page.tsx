import type { ReactNode } from "react";
import { cx } from "./cx";

/** Page container: respects every safe area and leaves room for the tab bar. */
export function Page({
  children,
  className,
  wide,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  return (
    <main
      className={cx(
        "mx-auto w-full px-safe pb-clearance",
        wide ? "max-w-[1240px]" : "max-w-[820px]",
        className,
      )}
      style={{ paddingTop: "calc(max(16px, var(--sat)) + var(--page-top, 20px))" }}
    >
      {children}
    </main>
  );
}

export function PageHeader({
  title,
  eyebrow,
  actions,
  children,
}: {
  title: string;
  eyebrow?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1 text-fg-2">{eyebrow}</p>}
        <h1 className="text-large-title">{title}</h1>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      {children}
    </header>
  );
}

/** A calm, gently cosmic line for empty lists. */
export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col items-center px-6 py-10 text-center", className)}>
      <span
        className="mb-4 block size-10 rounded-full bg-[radial-gradient(circle_at_35%_35%,rgba(255,214,150,0.9),rgba(246,199,110,0.25)_55%,transparent_72%)]"
        aria-hidden="true"
      />
      <p className="text-headline text-fg">{title}</p>
      {body && <p className="mt-1 max-w-[320px] text-subhead text-fg-2">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
