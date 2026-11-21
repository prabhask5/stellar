"use client";

import { eraLabel, eraProgress } from "@stellar/shared";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
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

/** Phone: floating glass pill with five destinations. */
export function TabBar() {
  const pathname = usePathname();
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
