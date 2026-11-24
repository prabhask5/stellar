"use client";

import { useUi } from "@/lib/client/ui-store";
import { isBlockingActive } from "@stellar/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePush } from "@/components/settings/notifications";
import { Button, IconButton } from "@/components/ui/button";
import { BellIcon, ExitFullscreenIcon, FullscreenIcon, SlidersIcon } from "@/components/ui/icons";
import { Page } from "@/components/ui/page";
import { SyncIndicator } from "@/components/ui/sync-indicator";
import { useMounted } from "@/components/ui/use-media";
import { timerAction } from "@/lib/client/data/focus";
import { useCollection, useFocus } from "@/lib/client/data/hooks";
import { BlockingCard } from "./blocking";
import { FocusSettingsSheet } from "./settings-sheet";
import { FocusStats } from "./stats";
import { PhaseStrip, TimerControls, TimerFace } from "./timer";

const IOS_HINT =
  "On iPhone, add Stellar Planner to your Home Screen first; notifications work from the installed app.";

export function FocusPage() {
  const mounted = useMounted();
  const focus = useFocus();
  const { rows: lists } = useCollection("sp_block_lists");
  const { rows: sites } = useCollection("sp_block_list_sites");
  const { rows: sessions } = useCollection("sp_focus_sessions");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const push = usePush();
  const overlay = useRef<HTMLDivElement>(null);
  const state = focus?.state;

  // Space starts or pauses, unless a control or a dialog has the keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (["INPUT", "TEXTAREA", "SELECT", "BUTTON", "A"].includes(t.tagName) || t.isContentEditable)
      )
        return;
      if (document.querySelector('[role="dialog"]') || useUi.getState().locked) return;
      const s = focus?.state;
      if (!s) return;
      e.preventDefault();
      timerAction(s.status === "running" ? "pause" : s.status === "paused" ? "resume" : "start");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus?.state]);

  // Home-screen shortcut "Start focus" opens here with ?start=1.
  const shortcutDone = useRef(false);
  useEffect(() => {
    if (
      shortcutDone.current ||
      !focus ||
      new URLSearchParams(window.location.search).get("start") !== "1"
    )
      return;
    shortcutDone.current = true;
    window.history.replaceState(null, "", "/focus");
    if (focus.state.status === "idle" || focus.state.status === "awaiting") timerAction("start");
    else if (focus.state.status === "paused") timerAction("resume");
  }, [focus]);

  const exitFullscreen = useCallback(() => {
    setFullscreen(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }, []);

  const enterFullscreen = useCallback(() => {
    setFullscreen(true);
    // The Fullscreen API is a bonus (not on iPhone); the overlay alone already hides everything else.
    requestAnimationFrame(() => void overlay.current?.requestFullscreen?.().catch(() => {}));
  }, []);

  useEffect(() => {
    if (!fullscreen) return;
    const onChange = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && exitFullscreen();
    document.addEventListener("fullscreenchange", onChange);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      window.removeEventListener("keydown", onKey);
    };
  }, [fullscreen, exitFullscreen]);

  const ready = mounted && focus && state;
  const showBell =
    push.status?.support === "supported" &&
    !push.status.subscribed &&
    push.status.permission !== "denied";

  return (
    <Page wide>
      <header className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-large-title">Focus</h1>
        <SyncIndicator />
      </header>

      {ready && (
        <div
          className="grid gap-8 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:items-start lg:gap-12"
          data-status={state.status}
          data-phase={state.phase}
          data-blocking={isBlockingActive(state)}
          data-testid="focus"
        >
          <div className="flex flex-col items-center gap-6">
            <PhaseStrip state={state} settings={focus.settings} />
            <TimerFace state={state} settings={focus.settings} />
            <TimerControls state={state} />
            <div className="w-full">
              <BlockingCard state={state} settings={focus.settings} lists={lists} sites={sites} />
            </div>
            <div className="flex w-full flex-wrap items-center justify-center gap-2">
              <Button
                variant="secondary"
                icon={<SlidersIcon size={18} />}
                onClick={() => setSettingsOpen(true)}
              >
                Timer settings
              </Button>
              <Button
                variant="secondary"
                icon={<FullscreenIcon size={18} />}
                onClick={enterFullscreen}
              >
                Fullscreen
              </Button>
              {showBell && (
                <Button
                  variant="tinted"
                  icon={<BellIcon size={18} />}
                  loading={push.busy}
                  onClick={() => void push.toggle(true)}
                >
                  Notify me when a phase ends
                </Button>
              )}
            </div>
            {push.status?.support === "needs-install" && (
              <p className="text-center text-footnote text-fg-2">{IOS_HINT}</p>
            )}
            {showBell && <p className="-mt-3 text-center text-footnote text-fg-2">{IOS_HINT}</p>}
          </div>
          <FocusStats state={state} sessions={sessions} />
        </div>
      )}

      {ready && (
        <FocusSettingsSheet
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
          settings={focus.settings}
        />
      )}

      {ready && fullscreen && (
        <div
          ref={overlay}
          role="dialog"
          aria-modal="true"
          aria-label="Fullscreen timer"
          className="fixed inset-0 z-[55] flex flex-col items-center justify-center gap-10 bg-[rgba(7,6,21,0.55)] animate-fade"
          style={{ paddingTop: "var(--sat)", paddingBottom: "var(--sab)" }}
          data-testid="focus-fullscreen"
        >
          <IconButton
            label="Exit fullscreen"
            onClick={exitFullscreen}
            className="absolute right-[max(20px,var(--sar))] top-[max(20px,var(--sat))]"
          >
            <ExitFullscreenIcon size={20} />
          </IconButton>
          <TimerFace state={state} settings={focus.settings} size={320} />
          <TimerControls state={state} />
        </div>
      )}
    </Page>
  );
}
