"use client";

import { cx } from "@/components/ui/cx";
import { GlassCard } from "@/components/ui/glass-card";
import { CheckIcon } from "@/components/ui/icons";
import { useSettings } from "@/lib/client/data/hooks";
import { updateSettings } from "@/lib/client/data/settings";
import { Section } from "./parts";

type Tier = "auto" | "cinematic" | "balanced" | "minimal";

const TIERS: { value: Tier; label: string; body: string }[] = [
  {
    value: "auto",
    label: "Auto",
    body: "Picks the best quality for this device and steps down if it struggles or the battery is low.",
  },
  {
    value: "cinematic",
    label: "Cinematic",
    body: "The full universe with bloom, at 60 frames per second.",
  },
  {
    value: "balanced",
    label: "Balanced",
    body: "Fewer particles and no glow effects. Easier on older devices.",
  },
  {
    value: "minimal",
    label: "Minimal",
    body: "A still starfield. No motion, the lightest on battery.",
  },
];

/** The universe behind this page is the live preview: it changes as soon as a tier is chosen. */
export function AppearanceSection() {
  // Rendered before the settings arrive too (nothing selected yet), so the sections below
  // do not jump down when they do.
  const settings = useSettings();
  return (
    <Section
      id="appearance"
      title="Appearance"
      description="How richly the universe is drawn. The sky behind this page updates as you choose."
    >
      <div role="radiogroup" aria-label="Universe quality" className="grid gap-2 sm:grid-cols-2">
        {TIERS.map((t) => {
          const active = settings?.quality_tier === t.value;
          return (
            <GlassCard
              key={t.value}
              radius="list"
              className={cx(
                "transition-colors duration-200",
                active && "!border-accent-line !bg-[rgba(246,199,110,0.10)]",
              )}
            >
              <button
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => updateSettings({ quality_tier: t.value })}
                className="flex h-full w-full items-start gap-3 rounded-list p-4 text-left"
              >
                <span className="min-w-0 flex-1">
                  <span className={cx("block text-headline", active ? "text-accent" : "text-fg")}>
                    {t.label}
                  </span>
                  <span className="mt-1 block text-footnote text-fg-2">{t.body}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={cx(
                    "mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px]",
                    active
                      ? "border-accent bg-accent text-accent-ink"
                      : "border-fg-2/60 text-transparent",
                  )}
                >
                  <CheckIcon size={14} strokeWidth={2.8} />
                </span>
              </button>
            </GlassCard>
          );
        })}
      </div>
    </Section>
  );
}
