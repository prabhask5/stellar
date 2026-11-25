"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { cx } from "./cx";

/**
 * Page container: respects every safe area and leaves room for the tab bar.
 *
 * On phones it also gives the page the iOS large-title behaviour: once the large title
 * has scrolled under the status bar, a compact glass bar with the same title fades in at
 * the top. The bar is fixed and only its opacity and transform change, so scrolling
 * itself is never animated.
 */
export function Page({
  children,
  className,
  wide,
}: {
  children: ReactNode;
  className?: string;
  wide?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const titleEl = useRef<HTMLSpanElement>(null);
  const [compact, setCompact] = useState(false);

  // Phones only; on wider screens the bar does not exist and nothing is observed. The heading
  // is looked up again after each render of the page (a list opening swaps it), which costs
  // one query; nothing watches the DOM in between.
  const watched = useRef<Element | null>(null);
  const observer = useRef<IntersectionObserver | null>(null);
  useEffect(() => {
    const main = ref.current;
    if (!main || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(min-width: 768px)").matches) return;
    const h1 = main.querySelector("h1");
    if (titleEl.current) titleEl.current.textContent = (h1?.textContent ?? "").trim();
    if (!h1 || h1 === watched.current) return;
    observer.current?.disconnect();
    watched.current = h1;
    const inset =
      parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sat")) || 0;
    observer.current = new IntersectionObserver(
      ([entry]) =>
        setCompact(Boolean(entry) && !entry!.isIntersecting && entry!.boundingClientRect.top < 80),
      { rootMargin: `-${Math.round(inset) + 6}px 0px 0px 0px`, threshold: 0 },
    );
    observer.current.observe(h1);
  });
  useEffect(() => () => observer.current?.disconnect(), []);

  return (
    <>
      <div
        aria-hidden="true"
        data-testid="compact-title"
        data-shown={compact || undefined}
        className={cx(
          "sp-compact-bar pointer-events-none fixed inset-x-0 top-0 z-30 flex items-end justify-center md:hidden",
          // Hidden outright when not shown: an invisible blurred layer is still composited.
          "transition-[opacity,transform,visibility] duration-200 ease-out",
          compact ? "visible translate-y-0 opacity-100" : "invisible -translate-y-1 opacity-0",
        )}
        style={{
          height: "calc(max(8px, var(--sat)) + 44px)",
          paddingLeft: "max(56px, var(--sal))",
          paddingRight: "max(56px, var(--sar))",
        }}
      >
        <span
          ref={titleEl}
          className="flex h-11 min-w-0 items-center truncate text-headline text-fg"
        />
      </div>
      <main
        ref={ref}
        className={cx(
          "mx-auto w-full px-safe pb-clearance",
          wide ? "max-w-[1240px]" : "max-w-[820px]",
          className,
        )}
        style={{ paddingTop: "calc(max(16px, var(--sat)) + var(--page-top, 20px))" }}
      >
        {children}
      </main>
    </>
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
