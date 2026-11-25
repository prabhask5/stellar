import type { CountdownEvent } from "@stellar/db";
import type { DateStr } from "@stellar/shared";
import { toast } from "../toast";
import { currentUserId, hardDeleteRow, insertRow, newId, nowIso, updateRow } from "./core";

export interface EventInput {
  name: string;
  emoji: string;
  date: DateStr;
  /** "HH:MM", or null for the start of the day. */
  time: string | null;
}

export function createEvent(input: EventInput): CountdownEvent {
  const now = nowIso();
  const row: CountdownEvent = {
    id: newId(),
    user_id: currentUserId(),
    name: input.name.trim(),
    emoji: input.emoji,
    date: input.date,
    time: input.time,
    created_at: now,
    updated_at: now,
  };
  insertRow("sp_events", row, {
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    date: row.date,
    time: row.time,
  });
  return row;
}

export function updateEvent(id: string, patch: Partial<EventInput>): void {
  updateRow(
    "sp_events",
    id,
    patch.name === undefined ? patch : { ...patch, name: patch.name.trim() },
  );
}

/** Deleted for good on the server; Undo puts the same event (same id) back. */
export function deleteEvent(id: string): void {
  const removed = hardDeleteRow("sp_events", id);
  if (!removed) return;
  toast(`Deleted “${removed.name}”`, {
    undo: () =>
      insertRow("sp_events", removed, {
        id: removed.id,
        name: removed.name,
        emoji: removed.emoji,
        date: removed.date,
        time: removed.time,
      }),
  });
}
