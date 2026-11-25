"use client";

import {
  type KeyboardEvent,
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

/**
 * A right-click menu for rows and cards on desktop: placed at the pointer and kept inside
 * the window; arrow keys move, Enter chooses, Escape and any outside click close, and
 * focus goes back to where it was. Touch devices never see it: there the same actions are
 * swipe actions and sheets. Loaded on demand by `useLazyContextMenu`.
 */
export function ContextMenu({
  request,
  onClose,
}: {
  request: { x: number; y: number; items: MenuItem[] };
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    returnTo.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const r = el.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(request.x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(request.y, window.innerHeight - r.height - 8)),
    });
    el.querySelector<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"])')?.focus();
  }, [request]);

  useEffect(() => {
    const away = (e: Event) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  const close = () => {
    onClose();
    returnTo.current?.focus?.();
  };

  const onKeyDown = (e: KeyboardEvent) => {
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
      items[(i + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      items[e.key === "Home" ? 0 : items.length - 1]?.focus();
    }
  };

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label="Actions"
      data-testid="context-menu"
      onKeyDown={onKeyDown}
      className="glass-strong fixed z-[90] min-w-[200px] animate-fade rounded-[14px] p-1.5 shadow-[0_18px_50px_rgba(0,0,0,0.5)]"
      style={{
        left: pos?.left ?? request.x,
        top: pos?.top ?? request.y,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      {request.items.map((item) => (
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
  );
}
