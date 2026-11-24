"use client";

import { isBlockingActive, phaseLabel } from "@stellar/shared";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import { type ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/ui/cx";
import {
  GearIcon,
  type IconProps,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  SearchIcon,
  StopIcon,
} from "@/components/ui/icons";
import { timerAction } from "@/lib/client/data/focus";
import { useFocus } from "@/lib/client/data/hooks";
import { createTaskForToday } from "@/lib/client/data/tasks";
import { toast } from "@/lib/client/toast";
import { useUi } from "@/lib/client/ui-store";
import { NAV } from "./nav";

interface Command {
  id: string;
  label: string;
  hint?: string;
  icon: ComponentType<IconProps>;
  keywords: string;
  run: () => void;
}

/** The command palette: add a task, jump to a page, start or pause focus. */
export function CommandBar() {
  const open = useUi((s) => s.commandOpen);
  const setOpen = useUi((s) => s.setCommandOpen);
  const router = useRouter();
  const focus = useFocus();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
    }
  }, [open]);

  const commands = useMemo<Command[]>(() => {
    const text = query.trim();
    const list: Command[] = [];
    if (text) {
      list.push({
        id: "add-task",
        label: `Add task “${text}”`,
        hint: "Due today",
        icon: PlusIcon,
        keywords: "",
        run: () => {
          createTaskForToday({ name: text });
          toast("Task added for today", { tone: "success" });
        },
      });
    }
    const state = focus?.state;
    if (state) {
      if (state.status === "running") {
        list.push({
          id: "focus-pause",
          label: `Pause ${phaseLabel(state.phase).toLowerCase()}`,
          icon: PauseIcon,
          keywords: "focus timer pause stop",
          run: () => timerAction("pause"),
        });
      } else if (state.status === "paused") {
        list.push({
          id: "focus-resume",
          label: `Resume ${phaseLabel(state.phase).toLowerCase()}`,
          icon: PlayIcon,
          keywords: "focus timer resume start",
          run: () => timerAction("resume"),
        });
      } else {
        list.push({
          id: "focus-start",
          label:
            state.status === "awaiting"
              ? `Start ${phaseLabel(state.phase).toLowerCase()}`
              : "Start focus",
          icon: PlayIcon,
          keywords: "focus timer start pomodoro",
          run: () => {
            timerAction("start");
            router.push("/focus");
          },
        });
      }
      if (state.status !== "idle") {
        list.push({
          id: "focus-end",
          label: "End focus session",
          hint: isBlockingActive(state) ? "Unblocks sites" : undefined,
          icon: StopIcon,
          keywords: "focus timer end stop",
          run: () => timerAction("end"),
        });
      }
    }
    NAV.forEach((item, i) => {
      list.push({
        id: `go-${item.href}`,
        label: `Go to ${item.label}`,
        hint: String(i + 1),
        icon: item.icon,
        keywords: `${item.label} open jump page`,
        run: () => router.push(item.href),
      });
    });
    list.push({
      id: "go-settings",
      label: "Go to Settings",
      icon: GearIcon,
      keywords: "settings preferences",
      run: () => router.push("/settings"),
    });

    if (!text) return list;
    const q = text.toLowerCase();
    // Commands that match what was typed come first; "Add task" is always offered after them.
    const matches = list.filter(
      (c) => c.id !== "add-task" && `${c.label} ${c.keywords}`.toLowerCase().includes(q),
    );
    return [...matches, ...list.filter((c) => c.id === "add-task")];
  }, [query, focus, router]);

  const index = Math.min(active, Math.max(0, commands.length - 1));

  const run = (command: Command | undefined) => {
    if (!command) return;
    setOpen(false);
    command.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((index + 1) % commands.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((index - 1 + commands.length) % commands.length);
    } else if (e.key === "Enter" && !e.nativeEvent.isComposing) {
      e.preventDefault();
      run(commands[index]);
    }
  };

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-[rgba(4,3,14,0.6)] animate-fade" />
        <Dialog.Content
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          className="glass-strong fixed left-1/2 top-[max(12dvh,calc(var(--sat)+16px))] z-[91] w-[min(560px,calc(100vw-32px))] -translate-x-1/2 overflow-hidden rounded-card shadow-[0_24px_70px_rgba(0,0,0,0.55)] outline-none animate-fade"
        >
          <Dialog.Title className="sr-only">Command bar</Dialog.Title>
          <div className="flex items-center gap-3 border-b border-separator px-4">
            <SearchIcon size={18} className="shrink-0 text-fg-2" />
            <input
              autoComplete="off"
              enterKeyHint="done"
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              placeholder="Add a task, or jump somewhere"
              aria-label="Command"
              role="combobox"
              aria-expanded="true"
              aria-controls="command-list"
              aria-activedescendant={commands[index] ? `cmd-${commands[index].id}` : undefined}
              className="h-14 min-w-0 flex-1 bg-transparent text-[17px] text-fg outline-none placeholder:text-fg-2/70"
            />
            <kbd className="hidden rounded-md border border-hairline px-1.5 py-0.5 text-caption text-fg-2 md:block">
              esc
            </kbd>
          </div>
          <ul
            id="command-list"
            ref={listRef}
            role="listbox"
            aria-label="Commands"
            className="max-h-[min(50dvh,380px)] overflow-y-auto p-2"
          >
            {commands.map((c, i) => (
              <li
                key={c.id}
                id={`cmd-${c.id}`}
                role="option"
                aria-selected={i === index}
                data-index={i}
              >
                <button
                  type="button"
                  onClick={() => run(c)}
                  onPointerMove={() => setActive(i)}
                  className={cx(
                    "flex h-11 w-full items-center gap-3 rounded-chip px-3 text-left text-[15px]",
                    i === index ? "bg-fill-selected text-fg" : "text-fg-2",
                  )}
                >
                  <c.icon size={18} className={i === index ? "text-accent" : undefined} />
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  {c.hint && <span className="shrink-0 text-caption text-fg-2">{c.hint}</span>}
                </button>
              </li>
            ))}
            {commands.length === 0 && (
              <li className="px-3 py-6 text-center text-subhead text-fg-2">
                Nothing matches that.
              </li>
            )}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
