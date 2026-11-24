"use client";

import { eraLabel, eraProgress } from "@stellar/shared";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type ComponentType, type MouseEvent, useEffect, useRef } from "react";
import { cx } from "@/components/ui/cx";
import {
  FocusIcon,
  GearIcon,
  GoalsIcon,
  type IconProps,
  RoutinesIcon,
  TasksIcon,
  UniverseIcon,
} from "@/components/ui/icons";
import { ProgressBar } from "@/components/ui/progress";
import { useUniverse } from "@/lib/client/data/hooks";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<IconProps>;
}

export const NAV: readonly NavItem[] = [
  { href: "/", label: "Universe", icon: UniverseIcon },
  { href: "/tasks", label: "Tasks", icon: TasksIcon },
  { href: "/goals", label: "Goals", icon: GoalsIcon },
  { href: "/routines", label: "Routines", icon: RoutinesIcon },
  { href: "/focus", label: "Focus", icon: FocusIcon },
];

export function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Where each tab was left: its address (segment, open list) and how far it was scrolled. */
const tabMemory = new Map<string, { url: string; scroll: number }>();
const MEMORY_KEY = "sp-tab-memory";

function tabOf(pathname: string): string | null {
  return NAV.find((n) => isActive(pathname, n.href))?.href ?? null;
}

function loadMemory(): void {
  if (tabMemory.size > 0) return;
  try {
    const saved = JSON.parse(sessionStorage.getItem(MEMORY_KEY) ?? "{}") as Record<
      string,
      { url: string; scroll: number }
    >;
    for (const [k, v] of Object.entries(saved)) tabMemory.set(k, v);
  } catch {
    // nothing remembered
  }
}

function saveMemory(): void {
  try {
    sessionStorage.setItem(MEMORY_KEY, JSON.stringify(Object.fromEntries(tabMemory)));
  } catch {
    // ignored
  }
}

/**
 * Tab behaviour of a native app:
 *  - switching tabs returns each one as it was left: same segment, same open list, same
 *    scroll position (the data is already in memory, so there is nothing to wait for);
 *  - tapping the tab you are on scrolls to the top, and from the top goes back to the
 *    tab's first screen.
 */
function useTabs(pathname: string) {
  const router = useRouter();
  const pending = useRef<number | null>(null);

  // After a tab switch, put the page back where it was.
  useEffect(() => {
    const target = pending.current;
    pending.current = null;
    if (target === null) return;
    let tries = 0;
    const restore = () => {
      window.scrollTo(0, target);
      // Content may still be laying out; try until the position holds or we run out of frames.
      if (Math.abs(window.scrollY - target) > 2 && tries++ < 12) requestAnimationFrame(restore);
    };
    requestAnimationFrame(restore);
  }, [pathname]);

  return (e: MouseEvent<HTMLAnchorElement>, href: string) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    loadMemory();
    const here = window.location.pathname + window.location.search;
    const current = tabOf(window.location.pathname);
    if (current === href) {
      if (window.scrollY > 4) {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
      } else if (here !== href) {
        tabMemory.delete(href);
        saveMemory();
        router.push(href, { scroll: false });
      }
      return;
    }
    if (current) tabMemory.set(current, { url: here, scroll: window.scrollY });
    const back = tabMemory.get(href);
    saveMemory();
    pending.current = back?.scroll ?? 0;
    router.push(back?.url ?? href, { scroll: false });
  };
}

/** Phone: floating glass pill with five destinations. */
export function TabBar() {
  const pathname = usePathname();
  const onTab = useTabs(pathname);
  return (
    <nav
      aria-label="Main"
      className="sp-tabbar glass fixed z-40 flex items-stretch rounded-tabbar !bg-[rgba(17,14,42,0.985)] p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.35)] md:hidden"
      style={{
        height: "var(--tabbar-h)",
        bottom: "var(--tabbar-bottom)",
        left: "max(16px, var(--sal))",
        right: "max(16px, var(--sar))",
      }}
    >
      {NAV.map(({ href, label, icon: Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            onClick={(e) => onTab(e, href)}
            draggable={false}
            data-press="scale"
            className={cx(
              "flex min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-[24px] transition-colors duration-200",
              active ? "bg-fill-selected text-accent" : "text-fg-2 active:bg-fill-hover",
            )}
          >
            <Icon size={22} />
            <span className={cx("text-tab leading-none", active && "font-semibold")}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function EraCard() {
  const universe = useUniverse();
  const total = universe?.total ?? 0;
  const p = eraProgress(total);
  return (
    <div className="glass rounded-list p-3" data-testid="era-card">
      <p className="text-caption text-fg-2">{eraLabel(p.era)}</p>
      <ProgressBar value={p.fraction} label="Progress to the next era" className="my-2" />
      <p className="text-caption text-fg-2 tnum">
        {p.next
          ? `${p.remaining.toLocaleString("en-US")} stars to ${p.next.name}`
          : "The final era"}
      </p>
    </div>
  );
}

/** Tablet: icon rail. Desktop: sidebar with labels and Era progress at the bottom. */
export function SideNav() {
  const pathname = usePathname();
  const onTab = useTabs(pathname);
  const settingsActive = isActive(pathname, "/settings");
  return (
    <nav
      aria-label="Main"
      className="fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-hairline bg-[rgba(10,8,28,0.55)] backdrop-blur-xl md:flex"
      style={{
        width: "calc(var(--nav-w) + var(--sal))",
        paddingLeft: "var(--sal)",
        paddingTop: "max(16px, var(--sat))",
        paddingBottom: "max(16px, var(--sab))",
      }}
    >
      <Link
        href="/"
        className="mx-3 mb-5 mt-3 hidden h-9 items-center px-3 text-[17px] font-semibold tracking-[-0.01em] text-fg lg:flex"
      >
        Stellar Planner
      </Link>
      <span
        className="mx-auto mb-4 mt-2 flex size-10 items-center justify-center rounded-full border border-accent-line bg-accent-soft text-accent lg:hidden"
        aria-hidden="true"
      >
        <UniverseIcon size={20} />
      </span>
      <ul className="flex flex-1 flex-col gap-1 px-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                aria-label={label}
                title={label}
                onClick={(e) => onTab(e, href)}
                draggable={false}
                className={cx(
                  "flex h-11 items-center justify-center gap-3 rounded-button px-0 text-[15px] transition-colors duration-100 lg:h-10 lg:justify-start lg:px-3",
                  active
                    ? "bg-fill-selected font-semibold text-fg"
                    : "text-fg-2 hover:bg-fill-hover hover:text-fg",
                )}
              >
                <Icon size={20} className={active ? "text-accent" : undefined} />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-3 px-3">
        <Link
          href="/settings"
          aria-current={settingsActive ? "page" : undefined}
          aria-label="Settings"
          title="Settings"
          className={cx(
            "flex h-11 items-center justify-center gap-3 rounded-button text-[15px] transition-colors duration-100 lg:h-10 lg:justify-start lg:px-3",
            settingsActive
              ? "bg-fill-selected font-semibold text-fg"
              : "text-fg-2 hover:bg-fill-hover hover:text-fg",
          )}
        >
          <GearIcon size={20} className={settingsActive ? "text-accent" : undefined} />
          <span className="hidden lg:inline">Settings</span>
        </Link>
        <div className="hidden lg:block">
          <EraCard />
        </div>
      </div>
    </nav>
  );
}
