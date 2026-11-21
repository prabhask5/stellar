"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect } from "react";
import { type Toast, useToasts } from "@/lib/client/toast";
import { cx } from "./cx";
import { CheckIcon, WarningIcon } from "./icons";

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  const reduce = useReducedMotion();

  useEffect(() => {
    const t = setTimeout(() => dismiss(toast.id), toast.duration);
    return () => clearTimeout(t);
  }, [toast.id, toast.duration, dismiss]);

  return (
    <motion.div
      layout={!reduce}
      role={toast.tone === "error" ? "alert" : "status"}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.97 }}
      transition={{ type: "spring", stiffness: 400, damping: 32 }}
      className="glass-strong pointer-events-auto flex min-h-12 w-full items-center gap-3 rounded-[16px] py-1.5 pl-4 pr-1.5 shadow-[0_12px_36px_rgba(0,0,0,0.45)]"
    >
      {toast.tone !== "default" && (
        <span className={cx("shrink-0", toast.tone === "error" ? "text-danger" : "text-success")}>
          {toast.tone === "error" ? <WarningIcon size={18} /> : <CheckIcon size={18} />}
        </span>
      )}
      <p className="min-w-0 flex-1 py-1.5 text-[15px] leading-5 text-fg">{toast.message}</p>
      {toast.undo && (
        <button
          type="button"
          onClick={() => {
            toast.undo?.();
            dismiss(toast.id);
          }}
          className="h-9 shrink-0 rounded-chip px-3 text-[15px] font-semibold text-accent hover:bg-fill-hover"
        >
          Undo
        </button>
      )}
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.run();
            dismiss(toast.id);
          }}
          className="h-9 shrink-0 rounded-chip px-3 text-[15px] font-semibold text-accent hover:bg-fill-hover"
        >
          {toast.action.label}
        </button>
      )}
    </motion.div>
  );
}

/** Glass toasts at the bottom of the screen, above the tab bar and the home indicator. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 z-[80] flex flex-col items-center gap-2 md:items-end"
      style={{
        bottom: "calc(var(--toast-bottom, max(16px, var(--sab))) + var(--kb))",
        paddingLeft: "max(16px, var(--sal))",
        paddingRight: "max(16px, var(--sar))",
      }}
    >
      <div className="flex w-full max-w-[420px] flex-col gap-2">
        <AnimatePresence initial={false}>
          {toasts.map((t) => (
            <ToastItem key={t.id} toast={t} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
