"use client";

import type { FocusSettings } from "@stellar/db";
import { GroupedList, ListRow } from "@/components/ui/grouped-list";
import { Sheet } from "@/components/ui/sheet";
import { Stepper } from "@/components/ui/stepper";
import { Switch } from "@/components/ui/switch";
import { type FocusSettingsPatch, updateFocusSettings } from "@/lib/client/data/focus";

type NumberKey = "focus_min" | "short_break_min" | "long_break_min" | "rounds_before_long";

const NUMBERS: {
  key: NumberKey;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: "focus_min", label: "Focus", unit: "min", min: 1, max: 600, step: 5 },
  { key: "short_break_min", label: "Short break", unit: "min", min: 1, max: 600, step: 1 },
  { key: "long_break_min", label: "Long break", unit: "min", min: 1, max: 600, step: 5 },
  {
    key: "rounds_before_long",
    label: "Rounds before a long break",
    unit: "rounds",
    min: 1,
    max: 12,
    step: 1,
  },
];

/** Phase lengths, rounds before a long break, and auto-start. Changes apply from the next phase. */
export function FocusSettingsSheet({
  open,
  onOpenChange,
  settings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  settings: FocusSettings;
}) {
  const set = (key: NumberKey, value: number, min: number, max: number) => {
    const next = Math.round(Math.min(max, Math.max(min, value)));
    if (next !== settings[key]) updateFocusSettings({ [key]: next } as FocusSettingsPatch);
  };
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Timer settings"
      description="Changes apply from the next phase. Every device follows the same timer."
      width={460}
    >
      <div className="flex flex-col gap-4" data-testid="focus-settings">
        <GroupedList>
          {NUMBERS.map((n) => (
            <ListRow
              key={n.key}
              title={n.label}
              subtitle={n.unit === "min" ? "Minutes" : undefined}
              trailing={
                <Stepper
                  label={n.label}
                  value={settings[n.key]}
                  min={n.min}
                  step={
                    n.key === "focus_min" || n.key === "long_break_min"
                      ? settings[n.key] % 5 === 0
                        ? 5
                        : 1
                      : n.step
                  }
                  unit={n.unit}
                  showValue
                  onStep={(delta) => set(n.key, settings[n.key] + delta, n.min, n.max)}
                  onSet={(value) => set(n.key, value, n.min, n.max)}
                />
              }
            />
          ))}
        </GroupedList>
        <GroupedList>
          <ListRow
            as="label"
            htmlFor="auto-breaks"
            title="Start breaks automatically"
            subtitle="Otherwise the timer waits for you after each focus phase."
            trailing={
              <Switch
                id="auto-breaks"
                label="Start breaks automatically"
                checked={settings.auto_start_breaks}
                onChange={(v) => updateFocusSettings({ auto_start_breaks: v })}
              />
            }
          />
          <ListRow
            as="label"
            htmlFor="auto-focus"
            title="Start focus automatically"
            subtitle="Begins the next focus phase as soon as a break ends."
            trailing={
              <Switch
                id="auto-focus"
                label="Start focus automatically"
                checked={settings.auto_start_focus}
                onChange={(v) => updateFocusSettings({ auto_start_focus: v })}
              />
            }
          />
        </GroupedList>
      </div>
    </Sheet>
  );
}
