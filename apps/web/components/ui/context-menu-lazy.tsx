"use client";

import { type ComponentType, type MouseEvent, type ReactNode, useState } from "react";
import type { MenuItem } from "./context-menu";

interface Request {
  x: number;
  y: number;
  items: MenuItem[];
}

/**
 * Right-click menus without their code in the page: the menu itself is fetched on the
 * first right-click (desktop only; a few milliseconds from the cache after that).
 */
export function useLazyContextMenu(): {
  onContextMenu: (e: MouseEvent, items: MenuItem[]) => void;
  menu: ReactNode;
} {
  const [Menu, setMenu] = useState<ComponentType<{
    request: Request;
    onClose: () => void;
  }> | null>(null);
  const [request, setRequest] = useState<Request | null>(null);
  return {
    onContextMenu: (e, items) => {
      // Touch long-press is ours for other things; a field keeps the browser's own menu.
      if ((e.nativeEvent as PointerEvent).pointerType === "touch") return;
      if ((e.target as Element).closest("input, textarea, [contenteditable='true'], .selectable"))
        return;
      e.preventDefault();
      setRequest({ x: e.clientX, y: e.clientY, items });
      if (!Menu)
        void import("./context-menu").then((m) => setMenu(() => m.ContextMenu)).catch(() => {});
    },
    menu: Menu && request ? <Menu request={request} onClose={() => setRequest(null)} /> : null,
  };
}
