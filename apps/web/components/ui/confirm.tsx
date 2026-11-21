"use client";

import type { ReactNode } from "react";
import { Button } from "./button";
import { Sheet } from "./sheet";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
}

/** A short confirmation for actions that cannot be undone. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  onConfirm,
  destructive = true,
}: ConfirmDialogProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={title} width={400}>
      <p className="text-subhead text-fg-2">{body}</p>
      <div className="mt-6 flex gap-3">
        <Button
          variant="secondary"
          size="lg"
          className="flex-1"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </Button>
        <Button
          variant={destructive ? "danger" : "primary"}
          size="lg"
          className="flex-1"
          onClick={() => {
            onConfirm();
            onOpenChange(false);
          }}
        >
          {confirmLabel}
        </Button>
      </div>
    </Sheet>
  );
}
