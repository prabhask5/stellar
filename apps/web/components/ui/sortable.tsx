"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

export interface SortableProps {
  ids: string[];
  /** Called with the moved id and its new neighbours (null at either end). */
  onMove: (id: string, beforeId: string | null, afterId: string | null) => void;
  layout?: "grid" | "list";
  children: ReactNode;
}

/**
 * Reordering with mouse (drag), touch (long-press, then drag) and keyboard
 * (focus the handle, Space, arrows, Space).
 */
export function Sortable({ ids, onMove, layout = "list", children }: SortableProps) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 260, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    const next = arrayMove(ids, from, to);
    onMove(String(active.id), next[to - 1] ?? null, next[to + 1] ?? null);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext
        items={ids}
        strategy={layout === "grid" ? rectSortingStrategy : verticalListSortingStrategy}
      >
        {children}
      </SortableContext>
    </DndContext>
  );
}

export interface SortableRenderProps {
  /** Spread on the element that starts a drag (the 6-dot handle, or the whole card on touch). */
  handle: HTMLAttributes<HTMLElement>;
  dragging: boolean;
}

export function SortableItem({
  id,
  children,
  className,
}: {
  id: string;
  children: (props: SortableRenderProps) => ReactNode;
  className?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined,
    position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style} className={className}>
      {children({
        handle: { ...attributes, ...listeners } as HTMLAttributes<HTMLElement>,
        dragging: isDragging,
      })}
    </div>
  );
}
