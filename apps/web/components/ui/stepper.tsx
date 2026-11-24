"use client";

import { haptic } from "@/lib/client/haptics";
import { formatAmount } from "@stellar/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "./cx";
import { MinusIcon, PlusIcon } from "./icons";

export interface StepperProps {
  value: number;
  onStep: (delta: number, element: HTMLElement) => void;
  /** Called when a number is typed. Enables "tap the number to type". */
  onSet?: (value: number, element: HTMLElement) => void;
  label: string;
  step?: number;
  min?: number;
  unit?: string | null;
  /** Show the editable number between − and +. */
  showValue?: boolean;
  className?: string;
}

/** −/+ segmented control. Holding a button repeats; tapping the number lets you type an exact value. */
export function Stepper({
  value,
  onStep,
  onSet,
  label,
  step = 1,
  min = 0,
  unit,
  showValue = false,
  className,
}: StepperProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const hold = useRef<{
    timer: ReturnType<typeof setTimeout> | null;
    interval: ReturnType<typeof setInterval> | null;
    fired: boolean;
  }>({
    timer: null,
    interval: null,
    fired: false,
  });
  const latest = useRef({ onStep, step, value, min });
  useEffect(() => {
    latest.current = { onStep, step, value, min };
  });

  const stop = useCallback(() => {
    if (hold.current.timer) clearTimeout(hold.current.timer);
    if (hold.current.interval) clearInterval(hold.current.interval);
    hold.current.timer = null;
    hold.current.interval = null;
  }, []);
  useEffect(() => stop, [stop]);

  const start = (dir: 1 | -1, el: HTMLElement) => {
    stop();
    hold.current.fired = false;
    hold.current.timer = setTimeout(() => {
      hold.current.fired = true;
      hold.current.interval = setInterval(() => {
        const now = latest.current;
        // At the floor the button disables itself, and a disabled button never reports the
        // finger lifting: stop here, or the repeat would run on unseen.
        if (dir < 0 && now.value <= now.min) return stop();
        haptic();
        now.onStep(dir * now.step, el);
      }, 90);
    }, 420);
  };

  const click = (dir: 1 | -1, el: HTMLElement) => {
    // A long press already stepped repeatedly; ignore the click that ends it.
    if (hold.current.fired) {
      hold.current.fired = false;
      return;
    }
    haptic();
    onStep(dir * step, el);
  };

  const commit = () => {
    const n = Number(draft.replace(",", "."));
    setEditing(false);
    if (draft.trim() !== "" && Number.isFinite(n) && n >= min && n !== value && inputRef.current)
      onSet?.(n, inputRef.current);
  };

  const button = (dir: 1 | -1) => (
    <button
      type="button"
      aria-label={`${dir > 0 ? "Increase" : "Decrease"} ${label}`}
      disabled={dir < 0 && value <= min}
      onClick={(e) => click(dir, e.currentTarget)}
      onPointerDown={(e) => start(dir, e.currentTarget)}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => e.preventDefault()}
      className="flex h-11 w-11 items-center justify-center text-fg transition-colors duration-100 hover:bg-fill-hover active:bg-fill-thumb disabled:text-fg-2/40 lg:h-9 lg:w-10"
    >
      {dir > 0 ? <PlusIcon size={18} /> : <MinusIcon size={18} />}
    </button>
  );

  return (
    <div
      className={cx(
        "inline-flex select-none items-stretch overflow-hidden rounded-chip border border-hairline bg-fill-subtle",
        className,
      )}
      role="group"
      aria-label={label}
    >
      {button(-1)}
      <span className="w-px self-stretch bg-separator" aria-hidden="true" />
      {showValue && (
        <>
          {editing ? (
            <input
              autoComplete="off"
              enterKeyHint="done"
              ref={inputRef}
              autoFocus
              inputMode="decimal"
              aria-label={`${label} amount`}
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/[^\d.,]/g, ""))}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-16 bg-transparent px-1 text-center text-fg outline-none tnum"
            />
          ) : (
            <button
              type="button"
              aria-label={`${label}: ${formatAmount(value)}${unit ? ` ${unit}` : ""}. Tap to type a value`}
              disabled={!onSet}
              onClick={() => {
                setDraft(formatAmount(value));
                setEditing(true);
              }}
              className="min-w-12 px-2 text-center text-[15px] font-medium text-fg tnum hover:bg-fill-hover"
            >
              {formatAmount(value)}
            </button>
          )}
          <span className="w-px self-stretch bg-separator" aria-hidden="true" />
        </>
      )}
      {button(1)}
    </div>
  );
}
