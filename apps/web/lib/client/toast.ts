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
}

interface ToastState {
  toasts: Toast[];
  push: (
    t: Omit<Toast, "id" | "tone" | "duration"> & {
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
    };
    // At most three at once; a repeated id replaces the earlier toast.
    set((s) => ({ toasts: [...s.toasts.filter((x) => x.id !== id), toast].slice(-3) }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export function toast(
  message: string,
  options: Partial<Omit<Toast, "id" | "message">> & { id?: string } = {},
): string {
  return useToasts.getState().push({ message, ...options });
}

export function toastError(message: string): string {
  return toast(message, { tone: "error", duration: 5000 });
}
