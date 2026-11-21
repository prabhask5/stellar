import type { Quote, Settings } from "@stellar/db";
import { keys, queryClient } from "../cache";
import { enqueue } from "../outbox";
import { toast } from "../toast";
import { currentUserId, hardDeleteRow, insertRow, newId, nowIso } from "./core";

export type SettingsPatch = Partial<
  Pick<
    Settings,
    | "timezone"
    | "week_start"
    | "birthdate"
    | "lifespan_years"
    | "quality_tier"
    | "show_completed"
    | "lock_after_minutes"
  >
>;

export function updateSettings(patch: SettingsPatch): void {
  queryClient.setQueryData<Settings>(keys.settings, (prev) =>
    prev ? { ...prev, ...patch } : prev,
  );
  enqueue({ kind: "update_singleton", table: "sp_settings", patch });
}

export function addQuote(text: string, author: string): Quote {
  const now = nowIso();
  const row: Quote = {
    id: newId(),
    user_id: currentUserId(),
    text: text.trim(),
    author: author.trim(),
    is_builtin: false,
    created_at: now,
    updated_at: now,
  };
  insertRow("sp_quotes", row, { id: row.id, text: row.text, author: row.author });
  return row;
}

export function deleteQuote(id: string): void {
  const removed = hardDeleteRow("sp_quotes", id);
  if (!removed) return;
  toast("Quote removed", {
    undo: () =>
      insertRow("sp_quotes", removed, {
        id: removed.id,
        text: removed.text,
        author: removed.author,
      }),
  });
}
