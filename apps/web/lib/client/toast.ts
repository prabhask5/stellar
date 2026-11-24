import { create } from "zustand";

export type ToastTone = "default" | "success" | "error";

export interface Toast {
  id: string;
  message: string;
  tone: ToastTone;
  /** Shown as an Undo button. Offered for destructive and bulk actions. */
  undo?: () => void;
  /** A different action label (e.g. "Reload"). */
  action?: { label: string; run: () => void };
  duration: number;
  /** When this content was shown; replacing a toast restarts its time on screen. */
  shownAt: number;
}

interface ToastState {
  toasts: Toast[];
  push: (
    t: Omit<Toast, "id" | "tone" | "duration" | "shownAt"> & {
      tone?: ToastTone;
      duration?: number;
      id?: string;
    },
  ) => string;
  dismiss: (id: string) => void;
}

export const UNDO_MS = 5000;

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (t) => {
    const id = t.id ?? crypto.randomUUID();
    const toast: Toast = {
      id,
      message: t.message,
      tone: t.tone ?? "default",
      undo: t.undo,
      action: t.action,
      duration: t.duration ?? (t.undo ? UNDO_MS : 3500),
      shownAt: Date.now(),
    };
    // At most three at once; a repeated id replaces the earlier toast. When one has to go,
    // it is the oldest plain message: an Undo or "Reload" is an offer that must stay until
    // it is taken or runs out.
    set((s) => {
      const next = [...s.toasts.filter((x) => x.id !== id), toast];
      while (next.length > 3) {
        const plain = next.findIndex((x) => !x.undo && !x.action && x.id !== id);
        next.splice(plain >= 0 ? plain : 0, 1);
      }
      return { toasts: next };
    });
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(
  message: string,
  options: Partial<Omit<Toast, "id" | "message" | "shownAt">> & { id?: string } = {},
): string {
  return useToasts.getState().push({ message, ...options });
}

export function toastError(message: string): string {
  return toast(message, { tone: "error", duration: 5000 });
}
