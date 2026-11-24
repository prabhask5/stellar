"use client";

import {
  type MouseEvent,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cx } from "./cx";

export interface MenuItem {
  label: string;
  run: () => void;
  icon?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
}

interface Open {
  x: number;
  y: number;
  items: MenuItem[];
  returnTo: HTMLElement | null;
}

/**
 * Right-click menus for rows and cards on desktop. One menu at a time, placed at the
 * pointer and kept inside the window; arrow keys move, Enter chooses, Escape and any
 * outside click close, and focus goes back to where it was. Touch devices never see it:
 * there the same actions are swipe actions and sheets.
 */
export function useContextMenu(): {
  onContextMenu: (e: MouseEvent, items: MenuItem[]) => void;
  menu: ReactNode;
} {
  const [open, setOpen] = useState<Open | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const close = (restore = true) => {
    setOpen((o) => {
      if (restore) o?.returnTo?.focus?.();
      return null;
    });
    setPos(null);
  };

  useLayoutEffect(() => {
    const el = ref.current;
    if (!open || !el) return;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(open.x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(open.y, window.innerHeight - r.height - 8)),
    });
    el.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) close(false);
    };
    const dismiss = () => close(false);
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
    };
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = [
      ...(ref.current?.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ) ?? []),
    ];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape" || e.key === "Tab") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length];
      next?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus();
    }
  };

  const menu = open
    ? createPortal(
        <div
          ref={ref}
          role="menu"
          aria-label="Actions"
          data-testid="context-menu"
          onKeyDown={onKeyDown}
          className="glass-strong fixed z-[90] min-w-[200px] animate-fade rounded-[14px] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.5)]"
          style={{
            left: pos?.left ?? open.x,
            top: pos?.top ?? open.y,
            visibility: pos ? "visible" : "hidden",
          }}
        >
          {open.items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              aria-disabled={item.disabled || undefined}
              onClick={() => {
                if (item.disabled) return;
                close();
                item.run();
              }}
              className={cx(
                "flex h-9 w-full items-center gap-2.5 rounded-thumb px-2.5 text-left text-[14px] outline-none",
                "hover:bg-fill-selected focus-visible:bg-fill-selected",
                item.danger ? "text-danger" : "text-fg",
                item.disabled && "opacity-40",
              )}
            >
              {item.icon && <span className="shrink-0 text-current opacity-80">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>,
        document.body,
      )
    : null;

  return {
    onContextMenu: (e, items) => {
      // Touch long-press is ours for other things; a field keeps the browser's own menu.
      if ((e.nativeEvent as PointerEvent).pointerType === "touch") return;
      if ((e.target as Element).closest("input, textarea, [contenteditable='true'], .selectable"))
        return;
      e.preventDefault();
      setPos(null);
      setOpen({
        x: e.clientX,
        y: e.clientY,
        items,
        returnTo: document.activeElement instanceof HTMLElement ? document.activeElement : null,
      });
    },
    menu,
  };
}
