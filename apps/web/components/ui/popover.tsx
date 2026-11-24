"use client";

import {
  cloneElement,
  isValidElement,
  type MouseEvent,
  type ReactNode,
  Suspense,
  useState,
} from "react";
import { whenIdle } from "@/lib/client/idle";
import { preloadable } from "@/lib/client/preloadable";
import type { PopoverProps } from "./popover-impl";

export type { PopoverProps };

const { Component: PopoverImpl, preload } = preloadable<PopoverProps>(() =>
  import("./popover-impl").then((m) => m.Popover),
);
if (typeof window !== "undefined") whenIdle(() => void preload().catch(() => {}));

/**
 * Glass popover for desktop pickers. Until it is first opened only the trigger
 * is rendered; the positioning and focus machinery loads when the browser is
 * idle, or on that first click.
 */
export function Popover(props: PopoverProps) {
  const [used, setUsed] = useState(props.open);
  if (props.open && !used) setUsed(true);

  const bare: ReactNode = isValidElement<{ onClick?: (e: MouseEvent) => void }>(props.trigger)
    ? cloneElement(props.trigger, {
        onClick: (e: MouseEvent) => {
          (props.trigger as { props: { onClick?: (e: MouseEvent) => void } }).props.onClick?.(e);
          if (!e.defaultPrevented) props.onOpenChange(true);
        },
      })
    : props.trigger;

  if (!used) return bare;
  return (
    <Suspense fallback={bare}>
      <PopoverImpl {...props} />
    </Suspense>
  );
}
