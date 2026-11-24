"use client";

import {
  AnimatePresence,
  type PanInfo,
  useDragControls,
  useIsPresent,
  useReducedMotion,
} from "motion/react";
import * as m from "motion/react-m";
import { Dialog } from "radix-ui";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { IconButton } from "./button";
import { XIcon } from "./icons";
import { useIsWide } from "./use-media";

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  /** Hide the title visually (it is still announced). */
  hideTitle?: boolean;
  description?: string;
  children: ReactNode;
  /** Phone detent: "auto" hugs the content, "large" fills most of the screen. */
  detent?: "auto" | "large";
  /** Desktop dialog width. */
  width?: number;
  footer?: ReactNode;
  className?: string;
}

const SPRING = { type: "spring", stiffness: 300, damping: 32 } as const;

/**
 * Bottom sheet on phones (drag down to dismiss, respects the home indicator
 * and the keyboard), centred dialog from 768px up. Focus is trapped and
 * restored by Radix Dialog.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  hideTitle,
  description,
  children,
  detent = "auto",
  width = 480,
  footer,
  className,
}: SheetProps) {
  const wide = useIsWide();
  const reduce = useReducedMotion();
  const controls = useDragControls();

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 600) onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <m.div
                className="fixed inset-0 z-[60] bg-[rgba(4,3,14,0.62)]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>
            <Dialog.Content
              asChild
              forceMount
              aria-describedby={description ? undefined : undefined}
            >
              {wide ? (
                <m.div
                  className={cx(
                    "glass-strong fixed left-1/2 top-1/2 z-[61] flex max-h-[min(86dvh,760px)] w-[calc(100vw-48px)] flex-col rounded-hero outline-none",
                    className,
                  )}
                  style={{ maxWidth: width, x: "-50%", y: "-50%" }}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
                  transition={reduce ? { duration: 0.15 } : SPRING}
                >
                  <ExitGuard>
                    <Header
                      title={title}
                      hideTitle={hideTitle}
                      description={description}
                      onClose={() => onOpenChange(false)}
                    />
                    <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6">
                      {children}
                    </div>
                    {footer && <div className="border-t border-separator px-6 py-4">{footer}</div>}
                  </ExitGuard>
                </m.div>
              ) : (
                <m.div
                  className={cx(
                    "glass-strong fixed inset-x-0 bottom-0 z-[61] flex flex-col rounded-t-hero border-b-0 outline-none",
                    detent === "large" ? "h-[92dvh]" : "max-h-[92dvh]",
                    className,
                  )}
                  style={{
                    paddingLeft: "var(--sal)",
                    paddingRight: "var(--sar)",
                    paddingBottom: "var(--kb)",
                  }}
                  initial={reduce ? { opacity: 0 } : { y: "100%" }}
                  animate={reduce ? { opacity: 1 } : { y: 0 }}
                  exit={reduce ? { opacity: 0 } : { y: "100%" }}
                  transition={reduce ? { duration: 0.15 } : SPRING}
                  drag={reduce ? false : "y"}
                  dragControls={controls}
                  dragListener={false}
                  dragConstraints={{ top: 0, bottom: 0 }}
                  dragElastic={{ top: 0, bottom: 0.6 }}
                  onDragEnd={onDragEnd}
                >
                  <ExitGuard>
                    <div
                      className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center active:cursor-grabbing"
                      onPointerDown={(e) => controls.start(e)}
                      aria-hidden="true"
                    >
                      <span className="h-[5px] w-9 rounded-full bg-white/25" />
                    </div>
                    <Header
                      title={title}
                      hideTitle={hideTitle}
                      description={description}
                      onClose={() => onOpenChange(false)}
                      compact
                    />
                    <div
                      className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5"
                      style={{ paddingBottom: footer ? 16 : "max(20px, var(--sab))" }}
                    >
                      {children}
                    </div>
                    {footer && (
                      <div
                        className="border-t border-separator px-5 pt-3"
                        style={{ paddingBottom: "max(12px, var(--sab))" }}
                      >
                        {footer}
                      </div>
                    )}
                  </ExitGuard>
                </m.div>
              )}
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/**
 * A sheet stays mounted while it animates out. During that time it must not take
 * input: a second tap on "Create" a few frames after the first would submit twice.
 */
function ExitGuard({ children }: { children: ReactNode }) {
  const present = useIsPresent();
  return (
    <div
      className="contents"
      inert={!present}
      onClickCapture={
        present
          ? undefined
          : (e) => {
              e.preventDefault();
              e.stopPropagation();
            }
      }
    >
      {children}
    </div>
  );
}

function Header({
  title,
  hideTitle,
  description,
  onClose,
  compact,
}: {
  title: string;
  hideTitle?: boolean;
  description?: string;
  onClose: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex shrink-0 items-start justify-between gap-3",
        compact ? "px-5 pb-3" : "px-6 pb-4 pt-6",
      )}
    >
      <div className="min-w-0">
        <Dialog.Title className={cx("text-title3", hideTitle && "sr-only")}>{title}</Dialog.Title>
        {description ? (
          <Dialog.Description className="mt-1 text-subhead text-fg-2">
            {description}
          </Dialog.Description>
        ) : (
          <Dialog.Description className="sr-only">{title}</Dialog.Description>
        )}
      </div>
      <IconButton
        label="Close"
        variant="subtle"
        size={32}
        onClick={onClose}
        className="-mr-1 shrink-0 text-fg-2"
      >
        <XIcon size={16} strokeWidth={2.2} />
      </IconButton>
    </div>
  );
}
