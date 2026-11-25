"use client";

import { Popover as RadixPopover } from "radix-ui";
import type { ReactNode } from "react";
import { cx } from "./cx";

export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  align?: "start" | "center" | "end";
  side?: "top" | "bottom" | "left" | "right";
  className?: string;
  label: string;
  /**
   * Keep the given side and alignment whatever room there is. For content that sizes itself
   * to the room available: left to choose, the popover would pick a side for the full size,
   * shrink to fit it, find it now fits the other side, and jump there.
   */
  fixed?: boolean;
}

/** Glass popover for desktop pickers. On phones the same content is shown in a Sheet. */
export function Popover({
  open,
  onOpenChange,
  trigger,
  children,
  align = "start",
  side = "bottom",
  className,
  label,
  fixed = false,
}: PopoverProps) {
  return (
    <RadixPopover.Root open={open} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>{trigger}</RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align={align}
          side={side}
          sideOffset={8}
          collisionPadding={12}
          avoidCollisions={!fixed}
          aria-label={label}
          // Never taller than the space the viewport leaves: scroll inside instead of running off screen.
          style={{ maxHeight: "var(--radix-popover-content-available-height)" }}
          className={cx(
            "overflow-y-auto overscroll-contain",
            "glass-strong z-[70] rounded-card p-3 shadow-[0_18px_50px_rgba(0,0,0,0.45)] outline-none animate-fade",
            className,
          )}
        >
          {children}
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  );
}
