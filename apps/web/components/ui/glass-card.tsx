import type { HTMLAttributes, Ref } from "react";
import { cx } from "./cx";

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  /** card = 20px radius, large = 22px, hero = 28px (summary cards). */
  radius?: "list" | "card" | "large" | "hero";
  strong?: boolean;
  as?: "div" | "section" | "article" | "aside";
  ref?: Ref<HTMLDivElement>;
}

const RADIUS = {
  list: "rounded-list",
  card: "rounded-card",
  large: "rounded-card-large",
  hero: "rounded-hero",
} as const;

/** The glass surface: translucent fill, hairline border, backdrop blur. */
export function GlassCard({
  radius = "card",
  strong,
  as: Tag = "div",
  className,
  ...rest
}: GlassCardProps) {
  return (
    <Tag className={cx(strong ? "glass-strong" : "glass", RADIUS[radius], className)} {...rest} />
  );
}
