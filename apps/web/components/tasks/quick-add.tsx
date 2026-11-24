"use client";

import type { TaskList } from "@stellar/db";
import type { DateStr, WeekStart } from "@stellar/shared";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { cx } from "@/components/ui/cx";
import type { DateValue } from "@/components/ui/date-picker";
import { DateChip } from "@/components/ui/date-chip";
import { inputClass } from "@/components/ui/field";
import { CheckIcon, GridIcon, TextIcon } from "@/components/ui/icons";
import { Popover } from "@/components/ui/popover";
import { Sheet } from "@/components/ui/sheet";
import { usePopoverFits } from "@/components/ui/use-media";
import { createTask, createTaskForToday } from "@/lib/client/data/tasks";
import { useUi } from "@/lib/client/ui-store";

export interface QuickAddBarProps {
  today: DateStr;
  weekStart: WeekStart;
  lists: TaskList[];
  /** Pre-filled due date (today on the Today tab, the selected day on the Calendar tab). */
  defaultDate?: DateStr | null;
  /** In a list's own quick-add the list is fixed and there is no date chip. */
  fixedListId?: string;
  placeholder?: string;
  /** Respond to the global "N" shortcut. */
  shortcut?: boolean;
}

/**
 * Glass bar: name input, chips for Due date, Description and List, and the
 * gold Add button. Enter submits. Choosing a list clears and disables the due
 * date, because list tasks have no dates.
 */
export function QuickAddBar({
  today,
  weekStart,
  lists,
  defaultDate = null,
  fixedListId,
  placeholder = "Add a task…",
  shortcut = false,
}: QuickAddBarProps) {
  const [name, setName] = useState("");
  const [due, setDue] = useState<DateValue>({ date: defaultDate, time: null });
  const [description, setDescription] = useState("");
  const [listId, setListId] = useState<string | null>(fixedListId ?? null);
  const [descOpen, setDescOpen] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const wide = usePopoverFits();
  const nonce = useUi((s) => s.quickAddNonce);
  const touched = useRef(false);

  // A name typed but not yet added survives the app being closed (iOS ends background apps).
  const draftKey = fixedListId ? `sp-draft-quickadd:${fixedListId}` : "sp-draft-quickadd";
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(draftKey) ?? "null") as {
        name: string;
        at: number;
      } | null;
      if (saved?.name && Date.now() - saved.at < 6 * 3_600_000) setName((n) => n || saved.name);
    } catch {
      // ignored
    }
  }, [draftKey]);
  useEffect(() => {
    try {
      if (name.trim()) localStorage.setItem(draftKey, JSON.stringify({ name, at: Date.now() }));
      else localStorage.removeItem(draftKey);
    } catch {
      // ignored
    }
  }, [name, draftKey]);

  // Follow the tab's default date until the user picks one themselves.
  useEffect(() => {
    if (!touched.current) setDue({ date: defaultDate, time: null });
  }, [defaultDate]);

  useEffect(() => {
    if (shortcut && nonce > 0) input.current?.focus();
  }, [nonce, shortcut]);

  const list = lists.find((l) => l.id === listId) ?? null;
  const inList = Boolean(fixedListId ?? listId);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      input.current?.focus();
      return;
    }
    const input_ = {
      name: trimmed,
      description: description.trim() || null,
      due_date: inList ? null : due.date,
      due_time: inList ? null : due.time,
      list_id: fixedListId ?? listId,
    };
    // An untouched default of "today" is resolved when the owner's time zone is known.
    if (!touched.current && input_.due_date !== null && input_.due_date === today) {
      const { due_date: _today, ...rest } = input_;
      createTaskForToday(rest);
    } else {
      createTask(input_);
    }
    setName("");
    setDescription("");
    touched.current = false;
    setDue({ date: defaultDate, time: null });
    if (!fixedListId) setListId(null);
    input.current?.focus();
  };

  const descriptionEditor = (
    <div>
      <label htmlFor="qa-description" className="sr-only">
        Description
      </label>
      <textarea
        autoComplete="off"
        enterKeyHint="enter"
        autoCapitalize="sentences"
        id="qa-description"
        autoFocus
        rows={3}
        maxLength={5000}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            setDescOpen(false);
            submit();
          }
        }}
        placeholder="Add a note"
        className={cx(inputClass, "h-auto resize-none py-2.5 leading-snug")}
      />
      <Button variant="primary" block className="mt-3" onClick={() => setDescOpen(false)}>
        Done
      </Button>
    </div>
  );

  const listChooser = (
    <ul
      role="listbox"
      aria-label="Task list"
      className="flex max-h-[300px] flex-col gap-0.5 overflow-y-auto"
    >
      {[{ id: null as string | null, name: "No list", emoji: "" }, ...lists].map((l) => {
        const selected = l.id === listId;
        return (
          <li key={l.id ?? "none"} role="option" aria-selected={selected}>
            <button
              type="button"
              onClick={() => {
                setListId(l.id);
                if (l.id) setDue({ date: null, time: null });
                setListOpen(false);
              }}
              className={cx(
                "flex h-11 w-full items-center gap-3 rounded-chip px-3 text-left text-[15px]",
                selected
                  ? "bg-fill-selected text-fg"
                  : "text-fg-2 hover:bg-fill-hover hover:text-fg",
              )}
            >
              <span className="w-6 text-center text-[18px]" aria-hidden="true">
                {l.emoji}
              </span>
              <span className="min-w-0 flex-1 truncate">{l.name}</span>
              {selected && <CheckIcon size={16} className="text-accent" />}
            </button>
          </li>
        );
      })}
      {lists.length === 0 && (
        <li className="px-3 py-2 text-footnote text-fg-2">Create a list first, in Task lists.</li>
      )}
    </ul>
  );

  const descChip = (
    <Chip
      active={Boolean(description.trim())}
      icon={<TextIcon size={16} />}
      aria-haspopup="dialog"
      aria-pressed={undefined}
      onClick={wide ? undefined : () => setDescOpen(true)}
    >
      Description
    </Chip>
  );
  const listChip = (
    <Chip
      active={Boolean(list)}
      icon={list ? <span aria-hidden="true">{list.emoji}</span> : <GridIcon size={16} />}
      aria-haspopup="listbox"
      aria-pressed={undefined}
      aria-label={list ? `List: ${list.name}` : "List"}
      onClick={wide ? undefined : () => setListOpen(true)}
    >
      <span className="max-w-[120px] truncate">{list ? list.name : "List"}</span>
    </Chip>
  );

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="glass flex flex-col gap-2 rounded-card p-2 md:flex-row md:items-center md:gap-2 md:pl-4"
      data-testid="quick-add"
    >
      <div className="flex min-w-0 flex-1 items-center gap-2 pl-2 md:pl-0">
        <label htmlFor={fixedListId ? "qa-name-list" : "qa-name"} className="sr-only">
          Task name
        </label>
        <input
          ref={input}
          id={fixedListId ? "qa-name-list" : "qa-name"}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={placeholder}
          maxLength={500}
          autoComplete="off"
          enterKeyHint="done"
          className="h-11 min-w-0 flex-1 bg-transparent text-fg outline-none placeholder:text-fg-2/70"
        />
        <span className="md:hidden">
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Add
          </Button>
        </span>
      </div>
      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto px-1 pb-1 md:overflow-visible md:p-0">
        {!fixedListId && (
          <DateChip
            value={due}
            onChange={(v) => {
              touched.current = true;
              setDue(v);
            }}
            today={today}
            weekStart={weekStart}
            disabled={inList}
            disabledReason="Tasks in a list don't have due dates"
          />
        )}
        {wide ? (
          <Popover
            open={descOpen}
            onOpenChange={setDescOpen}
            trigger={descChip}
            label="Description"
            className="w-[320px]"
          >
            {descriptionEditor}
          </Popover>
        ) : (
          descChip
        )}
        {!fixedListId &&
          (wide ? (
            <Popover
              open={listOpen}
              onOpenChange={setListOpen}
              trigger={listChip}
              label="Task list"
              align="end"
              className="w-[260px] p-2"
            >
              {listChooser}
            </Popover>
          ) : (
            listChip
          ))}
        <span className="hidden md:block">
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            Add
          </Button>
        </span>
      </div>
      {!wide && (
        <>
          <Sheet open={descOpen} onOpenChange={setDescOpen} title="Description">
            {descriptionEditor}
          </Sheet>
          <Sheet
            open={listOpen}
            onOpenChange={setListOpen}
            title="Add to a list"
            description="Tasks in a list stay out of Today and All, and have no due date."
          >
            {listChooser}
          </Sheet>
        </>
      )}
    </form>
  );
}
