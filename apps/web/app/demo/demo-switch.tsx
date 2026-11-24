"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/components/ui/switch";
import { enterDemo, exitDemo, isDemo } from "@/lib/client/demo";

/**
 * The public demo switch. On: the app opens on sample data that exists only in this tab.
 * Off: back to the PIN screen. Nothing here, and nothing in demo mode, reads the owner's data.
 */
export function DemoSwitch() {
  const [on, setOn] = useState(false);
  useEffect(() => setOn(isDemo()), []);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[440px] flex-col justify-center gap-6 px-6 py-10">
      <div>
        <p className="eyebrow text-accent">Stellar Planner</p>
        <h1 className="mt-2 text-title1">Try the demo</h1>
        <p className="mt-3 text-subhead text-fg-2">
          Tasks, goals, routines and a focus timer, in a sky that reflects what you do. The demo
          runs on made-up data inside this browser tab: nothing is saved, nothing is sent, and
          reloading the page starts it over.
        </p>
      </div>
      <label
        htmlFor="demo-mode"
        className="glass flex min-h-[60px] cursor-pointer items-center justify-between gap-4 rounded-card px-4"
      >
        <span>
          <span className="block text-fg">Demo mode</span>
          <span className="block text-footnote text-fg-2">
            {on ? "On. Turn off to leave the demo." : "Off. Turn on to look around."}
          </span>
        </span>
        <Switch
          id="demo-mode"
          label="Demo mode"
          checked={on}
          onChange={(next) => {
            setOn(next);
            if (next) enterDemo();
            else exitDemo();
          }}
        />
      </label>
      {on && (
        <button
          type="button"
          onClick={enterDemo}
          className="flex h-12 items-center justify-center rounded-button bg-accent font-semibold text-accent-ink"
        >
          Open the demo
        </button>
      )}
      <p className="text-footnote text-fg-2">
        This is a personal instance. Its owner&apos;s data is behind a PIN and is never part of the
        demo.
      </p>
    </main>
  );
}
