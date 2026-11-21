"use client";

import { timeProgress, toPercent } from "@stellar/shared";
import Link from "next/link";
import { useMemo, useState } from "react";
import { cx } from "@/components/ui/cx";
import { GlassCard } from "@/components/ui/glass-card";
import { ProgressBar } from "@/components/ui/progress";
import { useCollection, useMinute, useSettings } from "@/lib/client/data/hooks";
import { serverNow } from "@/lib/client/session";

/** A quote chosen at random each time the page is opened, from the built-in set and the owner's own. */
export function QuoteCard() {
  const { rows } = useCollection("sp_quotes");
  // One random draw per visit; it stays put while the page is open.
  const [seed] = useState(() => Math.random());
  const quote = rows.length > 0 ? rows[Math.floor(seed * rows.length) % rows.length] : null;
  return (
    <GlassCard
      as="section"
      radius="card"
      aria-label="Quote"
      className="min-h-[92px] p-5"
      data-testid="quote-card"
    >
      {quote && (
        <figure className="animate-fade">
          <blockquote className="text-[17px] font-medium leading-[24px] text-fg">
            “{quote.text}”
          </blockquote>
          {quote.author && (
            <figcaption className="mt-2 text-footnote text-fg-2">{quote.author}</figcaption>
          )}
        </figure>
      )}
    </GlassCard>
  );
}

const ROWS = [
  { key: "day", label: "Day", tone: "accent" },
  { key: "week", label: "Week", tone: "accent" },
  { key: "month", label: "Month", tone: "violet" },
  { key: "year", label: "Year", tone: "violet" },
  { key: "life", label: "Life", tone: "white" },
] as const;

/** Day, Week, Month, Year and Life progress in the owner's time zone and week start. */
export function TimeProgressCard() {
  const settings = useSettings();
  const minute = useMinute();
  const progress = useMemo(() => {
    if (!settings) return null;
    return timeProgress(
      minute || serverNow(),
      settings.timezone,
      settings.week_start,
      settings.birthdate,
      settings.lifespan_years,
    );
  }, [settings, minute]);

  return (
    <GlassCard
      as="section"
      radius="card"
      aria-label="Time progress"
      className="p-5"
      data-testid="time-card"
    >
      <div className="flex flex-col gap-3.5">
        {ROWS.map((row) => {
          const value = progress ? progress[row.key] : 0;
          if (row.key === "life" && progress && value === null) {
            return (
              <div key={row.key} className="flex items-center gap-4 text-[15px]">
                <span className="w-12 shrink-0 text-fg-2">Life</span>
                <Link href="/settings#general" className="text-accent hover:underline">
                  Add your birthdate
                </Link>
              </div>
            );
          }
          const pct = toPercent(value ?? 0);
          return (
            <div key={row.key} className="flex items-center gap-4 text-[15px]">
              <span className="w-12 shrink-0 text-fg-2">{row.label}</span>
              <ProgressBar
                value={value ?? 0}
                tone={row.tone}
                label={`${row.label} progress`}
                className="flex-1"
              />
              <span
                className={cx(
                  "w-11 shrink-0 text-right font-semibold text-fg tnum",
                  !progress && "opacity-0",
                )}
              >
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

const PLANET_HUES = [
  { core: "#FFE7B5", mid: "#F6C76E", glow: "rgba(246,199,110,0.55)" },
  { core: "#E2DBFF", mid: "#9D8CFF", glow: "rgba(157,140,255,0.55)" },
  { core: "#FFD3E6", mid: "#E86FA8", glow: "rgba(232,111,168,0.5)" },
  { core: "#CFE4FF", mid: "#6FA3FF", glow: "rgba(111,163,255,0.5)" },
] as const;

/** A tiny planet whose size follows the list's progress; it glows once the list is complete. Hue varies by list. */
export function MiniPlanet({
  progress,
  index,
  complete,
}: {
  progress: number;
  index: number;
  complete?: boolean;
}) {
  const hue = PLANET_HUES[index % PLANET_HUES.length] ?? PLANET_HUES[0];
  const size = 10 + Math.round(Math.min(1, Math.max(0, progress)) * 16);
  return (
    <span className="flex size-7 items-center justify-center" aria-hidden="true">
      <span
        className="rounded-full transition-[width,height,box-shadow] duration-[350ms] ease-out"
        style={{
          width: size,
          height: size,
          background: `radial-gradient(circle at 34% 30%, ${hue.core}, ${hue.mid} 55%, rgba(20,16,50,0.9) 100%)`,
          boxShadow: `0 0 ${complete ? 16 : 6 + progress * 8}px ${hue.glow}`,
        }}
      />
    </span>
  );
}
