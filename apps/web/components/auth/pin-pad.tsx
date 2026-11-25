"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui/cx";
import { BackspaceIcon } from "@/components/ui/icons";

export interface PinPadProps {
  value: string;
  onChange: (value: string) => void;
  /** Called on Enter, or automatically when `autoSubmitLength` digits are entered. */
  onSubmit?: (value: string) => void;
  maxLength?: number;
  minLength?: number;
  autoSubmitLength?: number | null;
  disabled?: boolean;
  /** Changes whenever an attempt fails, to replay the shake. */
  errorKey?: number;
  label: string;
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/**
 * PIN entry. Touch devices get a large iOS-style keypad; with a keyboard you
 * just type (digits, Backspace, Enter). Digits are never shown.
 */
export function PinPad({
  value,
  onChange,
  onSubmit,
  maxLength = 12,
  minLength = 6,
  autoSubmitLength = null,
  disabled = false,
  errorKey = 0,
  label,
}: PinPadProps) {
  const root = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const latest = useRef({ value, disabled, onChange, onSubmit, maxLength, autoSubmitLength });
  useEffect(() => {
    latest.current = { value, disabled, onChange, onSubmit, maxLength, autoSubmitLength };
  });

  const press = useCallback((key: string) => {
    const s = latest.current;
    if (s.disabled) return;
    // Keys can arrive faster than React re-renders (fast typists, password managers, slow
    // devices). The entered value is advanced here, at once, so no digit builds on a stale one.
    const commit = (next: string) => {
      s.value = next;
      s.onChange(next);
    };
    if (key === "back") {
      commit(s.value.slice(0, -1));
      return;
    }
    if (key === "enter") {
      if (s.value.length > 0) s.onSubmit?.(s.value);
      return;
    }
    if (s.value.length >= s.maxLength) return;
    const next = s.value + key;
    commit(next);
    if (s.autoSubmitLength && next.length === s.autoSubmitLength) s.onSubmit?.(next);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      // A pad that is covered (under the lock screen, in a sheet that is closing) is not the one being typed into.
      if (root.current?.closest("[inert]")) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (/^\d$/.test(e.key)) {
        e.preventDefault();
        press(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        press("back");
      } else if (e.key === "Enter") {
        e.preventDefault();
        press("enter");
      }
    };
    window.addEventListener("keydown", onKey);
    setReady(true);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  const dots = Math.max(minLength, Math.min(value.length, maxLength));

  return (
    <div
      ref={root}
      className="flex flex-col items-center"
      data-testid="pin-pad"
      // Set once the key listener is attached, so keys are not sent to a pad that cannot hear them yet.
      data-ready={ready || undefined}
    >
      <div
        key={errorKey}
        role="status"
        aria-live="polite"
        aria-label={`${label}: ${value.length} ${value.length === 1 ? "digit" : "digits"} entered`}
        className={cx(
          "flex h-6 items-center justify-center gap-3.5",
          errorKey > 0 && "animate-shake",
        )}
      >
        {Array.from({ length: dots }, (_, i) => (
          <span
            key={i}
            className={cx(
              "size-3 rounded-full border-[1.5px] transition-[background-color,border-color,transform] duration-100",
              i < value.length
                ? "scale-110 border-accent bg-accent"
                : "border-fg-2/70 bg-transparent",
            )}
          />
        ))}
      </div>

      <p className="mouse:block mt-4 hidden text-footnote text-fg-2">
        Type your PIN, then press Enter.
      </p>

      <div
        className="touch:grid mt-7 hidden grid-cols-3 gap-x-6 gap-y-4 short:mt-5 short:gap-y-3 flat:mt-3 flat:gap-x-4 flat:gap-y-2"
        aria-label="Keypad"
      >
        {KEYS.map((k) => (
          <Key key={k} onPress={() => press(k)} disabled={disabled} label={k}>
            {k}
          </Key>
        ))}
        <span aria-hidden="true" />
        <Key onPress={() => press("0")} disabled={disabled} label="0">
          0
        </Key>
        <Key
          onPress={() => press("back")}
          disabled={disabled || value.length === 0}
          label="Delete"
          plain
        >
          <BackspaceIcon size={28} />
        </Key>
      </div>
    </div>
  );
}

function Key({
  children,
  onPress,
  disabled,
  label,
  plain,
}: {
  children: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  label: string;
  plain?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onPress}
      className={cx(
        "flex size-[76px] items-center justify-center rounded-full text-[30px] font-light leading-none text-fg short:size-[64px] short:text-[26px] flat:size-[54px] flat:text-[24px]",
        "transition-[transform,background-color] duration-100 ease-out active:scale-[0.94] disabled:opacity-40",
        plain
          ? "text-fg-2 active:bg-fill-hover"
          : "border border-hairline bg-fill-subtle active:bg-fill-thumb",
      )}
    >
      {children}
    </button>
  );
}
