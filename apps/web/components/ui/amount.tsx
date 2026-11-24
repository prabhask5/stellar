"use client";

import { formatAmount } from "@stellar/shared";
import { useRef, useState } from "react";

export interface AmountLabelProps {
  current: number;
  total: number | null;
  unit?: string | null;
  label: string;
  /** Called with the typed value. Omit to make the label read-only. */
  onSet?: (value: number, element: HTMLElement) => void;
}

/** "5 / 8 glasses". Tapping the current number turns it into an input for an exact value. */
export function AmountLabel({ current, total, unit, label, onSet }: AmountLabelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const commit = () => {
    const n = Number(draft.replace(",", "."));
    setEditing(false);
    if (draft.trim() !== "" && Number.isFinite(n) && n >= 0 && n !== current && input.current)
      onSet?.(n, input.current);
  };

  return (
    <span className="whitespace-nowrap text-fg-2 tnum">
      {editing ? (
        <input
          autoComplete="off"
          enterKeyHint="done"
          ref={input}
          autoFocus
          inputMode="decimal"
          aria-label={`${label} amount`}
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d.,]/g, ""))}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setEditing(false);
          }}
          className="-my-1 w-14 rounded-md border border-accent-line bg-[rgba(10,8,28,0.6)] px-1 py-0.5 text-center text-fg outline-none"
        />
      ) : onSet ? (
        <button
          type="button"
          aria-label={`${label}: ${formatAmount(current)}${total !== null ? ` of ${formatAmount(total)}` : ""}${unit ? ` ${unit}` : ""}. Tap to type a value`}
          onClick={() => {
            setDraft(formatAmount(current));
            setEditing(true);
          }}
          className="-mx-1 -my-2 rounded-md px-1 py-2 font-medium text-fg underline decoration-fg-2/40 decoration-dotted underline-offset-4 hover:decoration-accent"
        >
          {formatAmount(current)}
        </button>
      ) : (
        <span className="font-medium text-fg">{formatAmount(current)}</span>
      )}
      {total !== null && <> / {formatAmount(total)}</>}
      {unit ? ` ${unit}` : ""}
    </span>
  );
}
