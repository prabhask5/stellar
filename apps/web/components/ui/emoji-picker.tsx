"use client";

import { Suspense, useEffect, useState } from "react";
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

/** One height for the loading state and the loaded grid, so the popover never resizes (and never flips sides). */
const EMOJI_BODY =
  "h-[min(70dvh,440px)] md:h-[min(400px,var(--radix-popover-content-available-height,400px))]";

const { Component: EmojiGrid, preload: loadGrid } = preloadable(() =>
  import("./emoji-grid").then((m) => m.EmojiGrid),
);
const loading = (
  <div className={cx("flex items-center justify-center text-fg-2", EMOJI_BODY)}>
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

  const body = (
    <Suspense fallback={loading}>
      <EmojiGrid recent={recent} onSelect={select} className={EMOJI_BODY} />
    </Suspense>
  );

  if (wide) {
    return (
      <Popover
        open={open}
        onOpenChange={setOpen}
        trigger={trigger}
        label="Choose an emoji"
        className="w-[340px] !overflow-hidden p-0"
      >
        {open ? body : null}
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
