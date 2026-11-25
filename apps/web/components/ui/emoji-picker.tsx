"use client";

import { type CSSProperties, Suspense, useEffect, useRef, useState } from "react";
import { whenIdle } from "@/lib/client/idle";
import { preloadable } from "@/lib/client/preloadable";
import { cx } from "./cx";
import { Spinner } from "./button";
import { Popover } from "./popover";
import { Sheet } from "./sheet";
import { usePopoverFits } from "./use-media";

const RECENT_KEY = "sp-recent-emoji";
const RECENT_MAX = 16;

export function recentEmoji(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as unknown;
    return Array.isArray(raw)
      ? raw.filter((e): e is string => typeof e === "string").slice(0, RECENT_MAX)
      : [];
  } catch {
    return [];
  }
}

export function rememberEmoji(emoji: string): void {
  try {
    const next = [emoji, ...recentEmoji().filter((e) => e !== emoji)].slice(0, RECENT_MAX);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable
  }
}

/**
 * One height for the loading state and the loaded grid, so the picker never resizes. In a
 * sheet it fills the sheet; in a popover it is whatever the chosen side has room for
 * (`--emoji-h`, see `place`). The choice follows the variant that is actually shown, not
 * the window's width: a phone held sideways is wide but gets the sheet, and a fixed
 * popover height there would be taller than the sheet and scroll inside its scroller.
 */
const BODY_IN_SHEET = "h-full min-h-[260px]";
const BODY_IN_POPOVER = "h-[var(--emoji-h,400px)] min-h-0";
const FULL = 400;
const WIDTH = 340;
/** Gap to the trigger plus the margin kept to the window's edge. */
const MARGIN = 20;

interface Placement {
  side: "top" | "bottom";
  align: "start" | "end";
  height: number;
}

/**
 * Where the popover goes, decided once from the trigger's position before it opens: below
 * if the whole picker fits there, otherwise the roomier side at the height that fits.
 * Letting the popover decide made it open above and then jump below in a short window.
 */
function place(trigger: HTMLElement): Placement {
  const r = trigger.getBoundingClientRect();
  const below = window.innerHeight - r.bottom - MARGIN;
  const above = r.top - MARGIN;
  const side = below >= FULL || below >= above ? "bottom" : "top";
  return {
    side,
    align: r.left + WIDTH + 12 > window.innerWidth ? "end" : "start",
    height: Math.max(160, Math.min(FULL, side === "bottom" ? below : above)),
  };
}

const { Component: EmojiGrid, preload: loadGrid } = preloadable(() =>
  import("./emoji-grid").then((m) => m.EmojiGrid),
);
const loading = (className: string) => (
  <div className={cx("flex items-center justify-center text-fg-2", className)}>
    <Spinner size={22} />
  </div>
);

let warmed = false;
/** Fetches the picker and its emoji data ahead of the first open, so opening it is instant. */
function warm(): void {
  if (warmed) return;
  warmed = true;
  void loadGrid().catch(() => (warmed = false));
  for (const file of ["data.json", "messages.json"])
    void fetch(`/emoji/en/${file}`).catch(() => {});
}

export interface EmojiPickerProps {
  value: string | null;
  onChange: (emoji: string) => void;
  /** Accessible name of the trigger, e.g. "List emoji". */
  label: string;
  /** Shown when no emoji is chosen yet. */
  placeholder?: string;
  size?: number;
  className?: string;
}

/** A 44px emoji tile that opens a searchable picker with the full emoji set and recent emojis. */
export function EmojiPicker({
  value,
  onChange,
  label,
  placeholder = "🙂",
  size = 44,
  className,
}: EmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<Placement>({
    side: "bottom",
    align: "start",
    height: FULL,
  });
  const button = useRef<HTMLButtonElement>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const wide = usePopoverFits();

  useEffect(() => {
    if (open) setRecent(recentEmoji());
  }, [open]);
  // A form with an emoji tile is on screen: get the picker ready while the name is typed.
  useEffect(() => whenIdle(warm), []);

  const select = (emoji: string) => {
    rememberEmoji(emoji);
    onChange(emoji);
    setOpen(false);
  };

  const trigger = (
    <button
      ref={button}
      type="button"
      aria-label={value ? `${label}: ${value}. Change` : `${label}. Choose`}
      onClick={wide ? undefined : () => setOpen(true)}
      className={cx(
        "flex shrink-0 items-center justify-center rounded-[14px] border border-hairline bg-fill-subtle leading-none transition-[transform,background-color] duration-100 hover:bg-fill-selected active:scale-[0.96]",
        !value && "opacity-60 grayscale",
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      <span aria-hidden="true">{value ?? placeholder}</span>
    </button>
  );

  const bodyClass = wide ? BODY_IN_POPOVER : BODY_IN_SHEET;
  const body = (
    <Suspense fallback={loading(bodyClass)}>
      <EmojiGrid recent={recent} onSelect={select} className={bodyClass} />
    </Suspense>
  );

  if (wide) {
    return (
      <Popover
        open={open}
        onOpenChange={(next) => {
          if (next && button.current) setPlacement(place(button.current));
          setOpen(next);
        }}
        trigger={trigger}
        label="Choose an emoji"
        side={placement.side}
        align={placement.align}
        fixed
        className="w-[340px] !overflow-hidden p-0"
      >
        {open ? (
          <div style={{ "--emoji-h": `${placement.height}px` } as CSSProperties}>{body}</div>
        ) : null}
      </Popover>
    );
  }
  return (
    <>
      {trigger}
      <Sheet
        open={open}
        onOpenChange={setOpen}
        title="Choose an emoji"
        detent="large"
        className="[&>div:last-child]:px-0"
      >
        {body}
      </Sheet>
    </>
  );
}
