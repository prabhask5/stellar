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
  /** Inactivity lock overlay. */
  locked: boolean;
  setLocked: (locked: boolean) => void;
}

export const LINGER_MS = 600;

export const useUi = create<UiState>((set, get) => ({
  commandOpen: false,
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  quickAddNonce: 0,
  focusQuickAdd: () => set((s) => ({ quickAddNonce: s.quickAddNonce + 1 })),
  lingering: new Set<string>(),
  linger: (id, ms = LINGER_MS) => {
    set((s) => ({ lingering: new Set(s.lingering).add(id) }));
    setTimeout(() => {
      const next = new Set(get().lingering);
      next.delete(id);
      set({ lingering: next });
    }, ms);
  },
  locked: false,
  setLocked: (locked) => set({ locked }),
}));
