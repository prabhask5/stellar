import { create } from "zustand";

interface UiState {
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  /** Bumped to ask the Tasks page to focus its quick-add input. */
  quickAddNonce: number;
  focusQuickAdd: () => void;
  /** Ids of tasks that were just completed and should linger briefly before leaving the list. */
  lingering: ReadonlySet<string>;
  linger: (id: string, ms?: number) => void;
  unlinger: (id: string) => void;
  /** The task row whose swipe actions are showing; only one is open at a time. */
  openRow: string | null;
  setOpenRow: (id: string | null) => void;
  /** Inactivity lock overlay. */
  locked: boolean;
  setLocked: (locked: boolean) => void;
}

export const LINGER_MS = 600;

const lingerTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useUi = create<UiState>((set, get) => ({
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  quickAddNonce: 0,
  focusQuickAdd: () => set((s) => ({ quickAddNonce: s.quickAddNonce + 1 })),
  lingering: new Set<string>(),
  linger: (id, ms = LINGER_MS) => {
    const pending = lingerTimers.get(id);
    if (pending) clearTimeout(pending);
    set((s) => ({ lingering: new Set(s.lingering).add(id) }));
    lingerTimers.set(
      id,
      setTimeout(() => get().unlinger(id), ms),
    );
  },
  unlinger: (id) => {
    const pending = lingerTimers.get(id);
    if (pending) clearTimeout(pending);
    lingerTimers.delete(id);
    if (!get().lingering.has(id)) return;
    const next = new Set(get().lingering);
    next.delete(id);
    set({ lingering: next });
  },
  openRow: null,
  setOpenRow: (openRow) => set({ openRow }),
  locked: false,
  setLocked: (locked) => set({ locked }),
}));
