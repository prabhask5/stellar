"use client";

import { EmojiPicker as Frimousse } from "frimousse";
import { SearchIcon } from "./icons";

/** The lazily loaded picker body. Data comes from /emoji (self-hosted), never a CDN. */
/**
 * The picker library numbers grid rows and columns from 0; ARIA counts from 1, and a
 * 0 is an invalid value that assistive technology may reject. Shift them here.
 */
function oneBased<T extends object>(props: T): T {
  const out = { ...props } as Record<string, unknown>;
  for (const key of ["aria-rowindex", "aria-colindex"]) {
    const v = out[key];
    if (typeof v === "number") out[key] = v + 1;
    else if (typeof v === "string" && v !== "" && Number.isFinite(Number(v)))
      out[key] = Number(v) + 1;
  }
  return out as T;
}

export function EmojiGrid({
  recent,
  onSelect,
}: {
  recent: string[];
  onSelect: (emoji: string) => void;
}) {
  return (
    <Frimousse.Root
      emojibaseUrl="/emoji"
      columns={8}
      onEmojiSelect={({ emoji }) => onSelect(emoji)}
      className="isolate flex h-full max-h-[min(70dvh,440px)] min-h-[320px] w-full flex-col md:h-[400px]"
    >
      <div className="relative mx-3 mt-3 shrink-0">
        <SearchIcon
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fg-2"
        />
        <Frimousse.Search
          aria-label="Search emoji"
          placeholder="Search emoji"
          className="h-10 w-full appearance-none rounded-chip border border-hairline bg-[rgba(10,8,28,0.55)] pl-9 pr-3 text-fg outline-none placeholder:text-fg-2/60 focus-visible:border-accent-line"
        />
      </div>

      {recent.length > 0 && (
        <div className="shrink-0 px-3 pt-3">
          <p className="pb-1 text-caption text-fg-2">Recent</p>
          <div
            className="no-scrollbar flex gap-0.5 overflow-x-auto"
            role="list"
            aria-label="Recent emoji"
          >
            {recent.map((emoji) => (
              <button
                key={emoji}
                type="button"
                role="listitem"
                aria-label={`Recent: ${emoji}`}
                onClick={() => onSelect(emoji)}
                className="flex size-10 shrink-0 items-center justify-center rounded-thumb text-[22px] hover:bg-fill-selected"
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      )}

      <Frimousse.Viewport className="relative mt-2 min-h-0 flex-1 outline-none">
        <Frimousse.Loading className="absolute inset-0 flex items-center justify-center text-subhead text-fg-2">
          Loading emoji
        </Frimousse.Loading>
        <Frimousse.Empty className="absolute inset-0 flex items-center justify-center text-subhead text-fg-2">
          No emoji found.
        </Frimousse.Empty>
        <Frimousse.List
          className="select-none pb-3"
          components={{
            CategoryHeader: ({ category, ...props }) => (
              <div
                className="bg-[#16123a] px-3 pb-1.5 pt-3 text-caption text-fg-2"
                {...oneBased(props)}
              >
                {category.label}
              </div>
            ),
            Row: ({ children, ...props }) => (
              <div className="scroll-my-1.5 px-2" {...oneBased(props)}>
                {children}
              </div>
            ),
            Emoji: ({ emoji, ...props }) => (
              <button
                className="flex aspect-square min-w-0 flex-1 items-center justify-center rounded-thumb text-[22px] data-[active]:bg-fill-thumb"
                {...oneBased(props)}
              >
                {emoji.emoji}
              </button>
            ),
          }}
        />
      </Frimousse.Viewport>
    </Frimousse.Root>
  );
}
