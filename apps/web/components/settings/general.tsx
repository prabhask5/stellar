"use client";

import { RowsSkeleton } from "@/components/ui/skeleton";
import { isDateStr } from "@stellar/shared";
import { useMemo } from "react";
import { GroupedList, ListRow } from "@/components/ui/grouped-list";
import { SegmentedControl } from "@/components/ui/segmented";
import { useSettings, useToday } from "@/lib/client/data/hooks";
import { updateSettings } from "@/lib/client/data/settings";
import { InlineSelect, rowInput, Section } from "./parts";

/**
 * City first ("Los Angeles · America"): in a narrow row the end of the label is what gets cut
 * off, and the city is the part that tells two zones apart.
 */
function zoneLabel(zone: string): string {
  const parts = zone.replace(/_/g, " ").split("/");
  const city = parts.pop() ?? zone;
  return parts.length ? `${city} · ${parts.join(" / ")}` : city;
}

function zones(current: string): { value: string; label: string; short: string }[] {
  const supported = (): string[] => {
    try {
      return Intl.supportedValuesOf("timeZone");
    } catch {
      return [];
    }
  };
  return [...new Set(["UTC", current, ...supported()])].sort().map((z) => ({
    value: z,
    label: zoneLabel(z),
    // The closed control shows the city alone, which leaves the row's title its room.
    short: z.replace(/_/g, " ").split("/").pop() ?? z,
  }));
}

export function GeneralSection() {
  const settings = useSettings();
  const today = useToday();
  const zoneOptions = useMemo(() => zones(settings?.timezone ?? "UTC"), [settings?.timezone]);
  // Hold the section's place while the settings load, so nothing below it shifts.
  if (!settings)
    return (
      <Section id="general" title="General">
        <RowsSkeleton rows={4} label="Loading settings" />
      </Section>
    );

  return (
    <Section id="general" title="General">
      <GroupedList>
        <ListRow
          as="label"
          htmlFor="set-timezone"
          title="Time zone"
          subtitle="Decides when your day starts and ends."
          trailing={
            <InlineSelect
              id="set-timezone"
              label="Time zone"
              value={settings.timezone}
              options={zoneOptions}
              onChange={(timezone) => updateSettings({ timezone })}
            />
          }
        />
        <ListRow
          title="Week starts on"
          trailing={
            <SegmentedControl
              label="Week starts on"
              size="sm"
              fit="content"
              value={String(settings.week_start) as "0" | "1"}
              onChange={(v) => updateSettings({ week_start: v === "0" ? 0 : 1 })}
              options={[
                { value: "1", label: "Mon" },
                { value: "0", label: "Sun" },
              ]}
            />
          }
        />
        <ListRow
          as="label"
          htmlFor="set-birthdate"
          title="Birthdate"
          subtitle="Used for the Life progress bar."
          trailing={
            <input
              autoComplete="off"
              id="set-birthdate"
              type="date"
              max={today}
              value={settings.birthdate ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "") updateSettings({ birthdate: null });
                else if (isDateStr(v) && v <= today) updateSettings({ birthdate: v });
              }}
              className={rowInput}
            />
          }
        />
        <ListRow
          as="label"
          htmlFor="set-lifespan"
          title="Expected lifespan"
          subtitle="In years."
          trailing={
            <input
              autoComplete="off"
              enterKeyHint="done"
              id="set-lifespan"
              type="number"
              inputMode="numeric"
              min={1}
              max={150}
              defaultValue={settings.lifespan_years}
              key={settings.lifespan_years}
              onBlur={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1 && n <= 150 && n !== settings.lifespan_years)
                  updateSettings({ lifespan_years: n });
                else e.target.value = String(settings.lifespan_years);
              }}
              onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
              className={`${rowInput} w-20 tnum`}
            />
          }
        />
      </GroupedList>
    </Section>
  );
}
