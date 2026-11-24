"use client";

import type { BlockList, BlockListSite, FocusSettings, FocusState } from "@stellar/db";
import { isBlockingActive } from "@stellar/shared";
import { useMemo, useState } from "react";
import { applyMove, ListFormSheet, rebalance } from "@/components/tasks/lists";
import { Button, IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { cx } from "@/components/ui/cx";
import { inputClass } from "@/components/ui/field";
import { GlassCard } from "@/components/ui/glass-card";
import { ChevronDownIcon, DragIcon, EditIcon, PlusIcon, XIcon } from "@/components/ui/icons";
import { Sheet } from "@/components/ui/sheet";
import { Sortable, SortableItem } from "@/components/ui/sortable";
import {
  addSites,
  createBlockList,
  deleteBlockList,
  removeSite,
  toggleBlockList,
  updateBlockList,
} from "@/lib/client/data/focus";
import { updateRow } from "@/lib/client/data/core";
import { rankBetween } from "@stellar/shared";

export interface BlockingProps {
  state: FocusState;
  settings: FocusSettings;
  lists: BlockList[];
  sites: BlockListSite[];
}

function siteCounts(sites: readonly BlockListSite[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const s of sites) map.set(s.block_list_id, (map.get(s.block_list_id) ?? 0) + 1);
  return map;
}

/**
 * Which lists are blocked. During focus (running or paused) it reads "Blocking
 * now"; during breaks "Sites open during break". Chips toggle lists at any time.
 */
export function BlockingCard({ state, settings, lists, sites }: BlockingProps) {
  const [managing, setManaging] = useState(false);
  const sorted = useMemo(() => [...lists].sort((a, b) => a.sort_order - b.sort_order), [lists]);
  const counts = useMemo(() => siteCounts(sites), [sites]);
  const active = new Set(settings.active_block_list_ids);
  const blocking = isBlockingActive(state);
  const onBreak = state.phase !== "focus" && state.status !== "idle";
  const anyActive = sorted.some((l) => active.has(l.id));
  const title = blocking
    ? anyActive
      ? "Blocking now"
      : "Nothing is blocked"
    : onBreak
      ? "Sites open during break"
      : "Block during focus";

  return (
    <GlassCard
      radius="card"
      as="section"
      aria-labelledby="blocking-title"
      className="p-4"
      data-testid="blocking-card"
      data-blocking={blocking && anyActive}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="blocking-title" className="text-headline">
          {title}
        </h2>
        <button
          type="button"
          onClick={() => setManaging(true)}
          className="-mr-2 flex h-9 items-center rounded-chip px-2 text-[15px] font-medium text-accent hover:bg-fill-hover"
        >
          Edit lists
        </button>
      </div>
      {sorted.length === 0 ? (
        <p className="text-subhead text-fg-2">
          No block lists yet. Create one to keep distracting sites closed while you focus.
        </p>
      ) : (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Block lists">
          {sorted.map((l) => {
            const n = counts.get(l.id) ?? 0;
            const on = active.has(l.id);
            return (
              <Chip
                key={l.id}
                active={on}
                onClick={() => toggleBlockList(l.id)}
                aria-label={`${l.name}, ${n} ${n === 1 ? "site" : "sites"}, ${on ? "on" : "off"}`}
                className="max-w-full !rounded-full"
              >
                {l.emoji && <span aria-hidden="true">{l.emoji}</span>}
                <span className="min-w-0 truncate">{l.name}</span>
                {on && (
                  <span className="tnum">
                    {" "}
                    · {n} {n === 1 ? "site" : "sites"}
                  </span>
                )}
              </Chip>
            );
          })}
        </div>
      )}
      {blocking && anyActive && (
        <p className="mt-3 text-footnote text-fg-2">
          Blocking stays on while paused. It lifts when the focus phase ends, on every device.
        </p>
      )}
      <BlockListsSheet open={managing} onOpenChange={setManaging} lists={sorted} sites={sites} />
    </GlassCard>
  );
}

function ListEditor({
  list,
  sites,
  handle,
}: {
  list: BlockList;
  sites: BlockListSite[];
  handle: React.HTMLAttributes<HTMLElement>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);
  const mine = useMemo(
    () =>
      sites
        .filter((s) => s.block_list_id === list.id)
        .sort((a, b) => a.pattern.localeCompare(b.pattern)),
    [sites, list.id],
  );

  const add = (value: string) => {
    if (!value.trim()) return;
    const r = addSites(list.id, value);
    const notes: string[] = [];
    if (r.invalid.length)
      notes.push(
        r.invalid.length === 1
          ? (r.invalid[0]?.message ?? "")
          : `${r.invalid.length} entries are not valid websites: ${r.invalid.map((i) => i.input).join(", ")}`,
      );
    if (r.duplicates.length)
      notes.push(
        r.duplicates.length === 1
          ? `${r.duplicates[0]} is already in this list.`
          : `${r.duplicates.length} were already in this list.`,
      );
    setMessage(
      notes.length ? { tone: r.invalid.length ? "error" : "info", text: notes.join(" ") } : null,
    );
    // Keep only what still needs fixing in the box.
    setText(r.invalid.map((i) => i.input).join("\n"));
  };

  return (
    <div data-testid="block-list" data-list={list.name}>
      <div className="flex min-h-[56px] items-center gap-1 pl-3 pr-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span
            className="flex size-9 shrink-0 items-center justify-center rounded-chip bg-fill-subtle text-[18px]"
            aria-hidden="true"
          >
            {list.emoji ?? "🚫"}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-fg">{list.name}</span>
            <span className="block text-footnote text-fg-2 tnum">
              {mine.length === 1 ? "1 site" : `${mine.length} sites`}
            </span>
          </span>
          <ChevronDownIcon
            size={16}
            className={cx(
              "shrink-0 text-fg-2 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </button>
        <IconButton
          label={`Edit ${list.name}`}
          variant="plain"
          size={40}
          onClick={() => setEditing(true)}
        >
          <EditIcon size={18} />
        </IconButton>
        <button
          type="button"
          {...handle}
          aria-label={`Reorder ${list.name}`}
          className="flex size-9 touch:size-11 cursor-grab touch-none items-center justify-center rounded-chip text-fg-2/60 hover:bg-fill-hover active:cursor-grabbing"
        >
          <DragIcon size={18} />
        </button>
      </div>
      {open && (
        <div className="border-t border-separator px-3 pb-3 pt-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add(text);
            }}
            className="flex items-start gap-2"
          >
            <label htmlFor={`sites-${list.id}`} className="sr-only">
              Websites to block in {list.name}
            </label>
            <textarea
              autoComplete="off"
              enterKeyHint="enter"
              id={`sites-${list.id}`}
              rows={text.includes("\n") ? 3 : 1}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (message) setMessage(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  add(text);
                }
              }}
              onPaste={(e) => {
                const pasted = e.clipboardData?.getData("text") ?? "";
                // Several lines pasted at once are added straight away.
                if (/[\n,]/.test(pasted.trim())) {
                  e.preventDefault();
                  add(`${text}\n${pasted}`);
                }
              }}
              placeholder="youtube.com (paste several at once)"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={message?.tone === "error" || undefined}
              aria-describedby={message ? `sites-msg-${list.id}` : undefined}
              className={cx(inputClass, "h-auto min-h-11 flex-1 resize-none py-2.5 leading-snug")}
            />
            <Button type="submit" variant="tinted" disabled={!text.trim()}>
              Add
            </Button>
          </form>
          {message && (
            <p
              id={`sites-msg-${list.id}`}
              role={message.tone === "error" ? "alert" : "status"}
              className={cx(
                "mt-2 text-footnote",
                message.tone === "error" ? "text-danger" : "text-fg-2",
              )}
            >
              {message.text}
            </p>
          )}
          {mine.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label={`Sites in ${list.name}`}>
              {mine.map((s) => (
                <li
                  key={s.id}
                  className="flex h-9 items-center gap-0.5 rounded-full border border-hairline bg-fill-subtle pl-3 pr-0.5 text-[14px] text-fg"
                >
                  {s.pattern}
                  <button
                    type="button"
                    aria-label={`Remove ${s.pattern}`}
                    onClick={() => removeSite(s.id)}
                    className="flex size-8 items-center justify-center rounded-full text-fg-2 hover:bg-fill-selected hover:text-fg"
                  >
                    <XIcon size={14} strokeWidth={2.2} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-footnote text-fg-2">
              No sites yet. A domain covers all of its subdomains.
            </p>
          )}
        </div>
      )}
      <ListFormSheet
        open={editing}
        onOpenChange={setEditing}
        list={list}
        noun="block list"
        defaultEmoji="🚫"
        onCreate={() => {}}
        onUpdate={updateBlockList}
        onDelete={deleteBlockList}
        deleteWarning={
          mine.length
            ? `Its ${mine.length === 1 ? "site is" : `${mine.length} sites are`} removed with it.`
            : "The list is empty."
        }
      />
    </div>
  );
}

/** Block list manager: create, rename, pick an emoji, delete, and edit each list's sites. */
export function BlockListsSheet({
  open,
  onOpenChange,
  lists,
  sites,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lists: BlockList[];
  sites: BlockListSite[];
}) {
  const [creating, setCreating] = useState(false);
  return (
    <>
      <Sheet
        open={open}
        onOpenChange={onOpenChange}
        title="Block lists"
        description="Sites in the lists you switch on are blocked by the browser extension while a focus phase runs."
        detent="large"
        width={520}
      >
        <div className="flex flex-col gap-3" data-testid="block-lists">
          {lists.length > 0 && (
            <Sortable
              ids={lists.map((l) => l.id)}
              onMove={(id, b, a) =>
                applyMove(
                  lists,
                  id,
                  b,
                  a,
                  (moved, before, after) =>
                    updateRow("sp_block_lists", moved, { sort_order: rankBetween(before, after) }),
                  () => rebalance("sp_block_lists"),
                )
              }
            >
              <div className="glass overflow-hidden rounded-list [&>*+*]:border-t [&>*+*]:border-separator">
                {lists.map((l) => (
                  <SortableItem key={l.id} id={l.id}>
                    {({ handle }) => <ListEditor list={l} sites={sites} handle={handle} />}
                  </SortableItem>
                ))}
              </div>
            </Sortable>
          )}
          <Button
            variant="tinted"
            block
            icon={<PlusIcon size={18} />}
            onClick={() => setCreating(true)}
          >
            New block list
          </Button>
        </div>
      </Sheet>
      <ListFormSheet
        open={creating}
        onOpenChange={setCreating}
        noun="block list"
        defaultEmoji="🚫"
        onCreate={(name, emoji) => createBlockList(name, emoji)}
        onUpdate={updateBlockList}
      />
    </>
  );
}
