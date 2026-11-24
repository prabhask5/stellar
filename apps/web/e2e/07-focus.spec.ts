import type { Page } from "@playwright/test";
import {
  ensureConfigured,
  expect,
  isPhone,
  signIn,
  sql,
  test,
  uniqueIp,
  wipeData,
} from "./helpers";

const OWNER = "(select id from auth.users where email = 'owner@stellar.local')";

const state = async () =>
  (
    await sql<{
      status: string;
      phase: string;
      round: number;
      version: number;
      paused: number | null;
    }>(
      `select status, phase, round, version::int as version, paused_remaining_ms as paused from sp_focus_state where user_id = ${OWNER}`,
    )
  )[0]!;
const blocking = async () =>
  (
    await sql<{ b: { active: boolean; patterns: string[] } }>(`select sp__blocking(${OWNER}) as b`)
  )[0]!.b;

async function seedBlockLists(): Promise<void> {
  await sql(`
    with l as (
      insert into sp_block_lists (user_id, name, sort_order) values (${OWNER}, 'Social', 1), (${OWNER}, 'News', 2), (${OWNER}, 'Video', 3) returning id, name)
    insert into sp_block_list_sites (user_id, block_list_id, pattern)
    select ${OWNER}, l.id, s from l, lateral unnest(case l.name
      when 'Social' then array['twitter.com','facebook.com','instagram.com','reddit.com','tiktok.com','linkedin.com']
      when 'News' then array['nytimes.com','bbc.com','theguardian.com','news.ycombinator.com']
      else array['youtube.com','netflix.com'] end) s`);
  await sql(
    `update sp_focus_settings set active_block_list_ids = array(select id from sp_block_lists where name in ('Social', 'News')) where user_id = ${OWNER}`,
  );
}

const focus = (page: Page) => page.getByTestId("focus");

test.describe("focus", () => {
  test.beforeAll(async ({ request }) => {
    await ensureConfigured(request);
  });
  test.beforeEach(async ({ context }) => {
    await wipeData();
    await signIn(context);
  });

  test("start, pause, resume, skip and end, with blocking following the rules", async ({
    page,
    shot,
  }) => {
    await seedBlockLists();
    await page.goto("/focus");
    await expect(focus(page)).toHaveAttribute("data-status", "idle");
    await expect(page.getByTestId("phase-strip")).toHaveText(
      /Focus\s*25.*Short break\s*5.*Long break\s*15/s,
    );
    await expect(page.getByTestId("timer-clock")).toHaveText("25:00");
    await expect(page.getByTestId("blocking-card")).toContainText("Block during focus");
    expect((await blocking()).active).toBe(false);

    // Start: optimistic within a frame, then confirmed by the server.
    await page.getByRole("button", { name: "Start focus" }).click();
    await expect(focus(page)).toHaveAttribute("data-status", "running");
    await expect(page.getByTestId("timer-clock")).toHaveText(/^24:5\d$/);
    await expect(page.getByTestId("timer-caption")).toHaveText("Round 1 of 4");
    await expect(page.getByTestId("blocking-card")).toContainText("Blocking now");
    await expect(page.getByTestId("blocking-card")).toContainText("Social · 6 sites");
    await expect(page.getByTestId("blocking-card")).toContainText("News · 4 sites");
    await expect.poll(async () => (await state()).status).toBe("running");
    const b = await blocking();
    expect(b.active).toBe(true);
    expect(b.patterns).toHaveLength(10);
    expect(b.patterns).not.toContain("youtube.com");
    await shot("focus-running");

    // Pause: the countdown freezes, and blocking stays on.
    await page.getByRole("button", { name: "Pause" }).click();
    await expect(focus(page)).toHaveAttribute("data-status", "paused");
    await expect(focus(page)).toHaveAttribute("data-blocking", "true");
    // The server's own figure for the paused time replaces the optimistic one; read after it lands.
    await expect.poll(async () => (await state()).status).toBe("paused");
    await page.waitForTimeout(400);
    const frozen = await page.getByTestId("timer-clock").innerText();
    await page.waitForTimeout(1300);
    await expect(page.getByTestId("timer-clock")).toHaveText(frozen);
    await expect.poll(async () => (await state()).status).toBe("paused");
    expect((await blocking()).active).toBe(true);

    // Toggle a list mid-session.
    await page.getByRole("button", { name: /^Video/ }).click();
    await expect.poll(async () => (await blocking()).patterns.includes("youtube.com")).toBe(true);

    await page.getByRole("button", { name: "Resume" }).click();
    await expect(focus(page)).toHaveAttribute("data-status", "running");

    // Skip: an abandoned focus phase is recorded; with auto-start off the break waits.
    await page.getByRole("button", { name: "Skip phase" }).click();
    await expect(focus(page)).toHaveAttribute("data-status", "awaiting");
    await expect(focus(page)).toHaveAttribute("data-phase", "short_break");
    await expect(page.getByTestId("timer-clock")).toHaveText("05:00");
    await expect(page.getByTestId("blocking-card")).toContainText("Sites open during break");
    await expect.poll(async () => (await blocking()).active).toBe(false);
    await expect
      .poll(async () => sql(`select phase, completed from sp_focus_sessions`))
      .toEqual([{ phase: "focus", completed: false }]);

    // Breaks never block, even when running.
    await page.getByRole("button", { name: "Start short break" }).click();
    await expect(focus(page)).toHaveAttribute("data-status", "running");
    await expect(focus(page)).toHaveAttribute("data-blocking", "false");
    await expect.poll(async () => (await blocking()).active).toBe(false);

    await page.getByRole("button", { name: "End session" }).click();
    await expect(focus(page)).toHaveAttribute("data-status", "idle");
    await expect(page.getByTestId("timer-clock")).toHaveText("25:00");
    await expect
      .poll(async () => state())
      .toMatchObject({ status: "idle", phase: "focus", round: 1 });
    await expect(page.getByTestId("session-log").getByRole("listitem")).toHaveCount(2);
    await expect(page.getByTestId("session-log")).toContainText("Ended early");
  });

  test("the server advances a finished phase with no client involved", async ({ page }) => {
    // A focus phase that ends in two seconds; nobody touches the app.
    await sql(
      `select sp__timer_apply(${OWNER}, 'start', (select version from sp_focus_state where user_id = ${OWNER}), now() - interval '24 minutes 58 seconds')`,
    );
    await expect
      .poll(async () => (await state()).status, { timeout: 12_000, intervals: [500] })
      .toBe("awaiting");
    expect(await state()).toMatchObject({ phase: "short_break", round: 1 });
    const sessions = await sql(`select phase, completed, actual_seconds from sp_focus_sessions`);
    expect(sessions).toEqual([{ phase: "focus", completed: true, actual_seconds: 1500 }]);
    expect(
      (await sql(`select notified_phase_end_at is not null as notified from sp_focus_state`))[0]
        ?.notified,
    ).toBe(true);
    const health = await (await page.request.get("/api/health")).json();
    expect(health.scheduler).toBe(true);

    // An open page learns about it through Realtime.
    await page.goto("/focus");
    await expect(focus(page)).toHaveAttribute("data-status", "awaiting");
    await expect(page.getByTestId("focus-stats")).toContainText("25m");
    await sql(`update sp_focus_settings set auto_start_breaks = true where user_id = ${OWNER}`);
    await sql(
      `select sp__timer_apply(${OWNER}, 'start', (select version from sp_focus_state where user_id = ${OWNER}), now() - interval '4 minutes 58 seconds')`,
    );
    await expect(focus(page)).toHaveAttribute("data-status", "running");
    await expect(focus(page)).toHaveAttribute("data-phase", "focus", { timeout: 12_000 });
    await expect(focus(page)).toHaveAttribute("data-status", "awaiting");
    await expect(page.getByTestId("timer-caption")).toHaveText("Ready when you are");
  });

  test("two devices share one timer", async ({ page, browser, baseURL }, info) => {
    const other = await browser.newContext({
      ...info.project.use,
      baseURL,
      extraHTTPHeaders: { "x-forwarded-for": uniqueIp() },
    });
    await signIn(other);
    const page2 = await other.newPage();
    await Promise.all([page.goto("/focus"), page2.goto("/focus")]);
    await expect(page.getByRole("status").filter({ hasText: "2 devices in sync" })).toBeVisible({
      timeout: 10_000,
    });

    await page.getByRole("button", { name: "Start focus" }).click();
    await expect(focus(page2)).toHaveAttribute("data-status", "running", { timeout: 4000 });
    await page2.getByRole("button", { name: "Pause" }).click();
    await expect(focus(page)).toHaveAttribute("data-status", "paused", { timeout: 4000 });
    const [a, b] = await Promise.all([
      page.getByTestId("timer-clock").innerText(),
      page2.getByTestId("timer-clock").innerText(),
    ]);
    expect(a).toBe(b);
    // Both press Skip at the same moment: the version check lets exactly one through.
    // Scheduled inside both pages for the same instant: two clicks sent from the test runner
    // can be far enough apart (Firefox) for the second page to have already seen the first
    // skip, which makes its own skip a legitimate second one.
    const at = Date.now() + 700;
    await Promise.all(
      [page, page2].map((p) =>
        p.evaluate(
          (t) =>
            new Promise<void>((resolve) =>
              setTimeout(
                () => {
                  document.querySelector<HTMLElement>('button[aria-label="Skip phase"]')?.click();
                  resolve();
                },
                Math.max(0, t - Date.now()),
              ),
            ),
          at,
        ),
      ),
    );
    await expect(focus(page)).toHaveAttribute("data-phase", "short_break");
    await expect(focus(page2)).toHaveAttribute("data-phase", "short_break");
    await expect
      .poll(async () => state())
      .toMatchObject({ status: "awaiting", phase: "short_break", round: 1 });
    expect((await sql(`select count(*)::int as n from sp_focus_sessions`))[0]?.n).toBe(1);
    await other.close();
  });

  test("timer settings, keyboard control and fullscreen", async ({ page }, info) => {
    await page.goto("/focus");
    await page.getByRole("button", { name: "Timer settings" }).click();
    const sheet = page.getByTestId("focus-settings");
    await sheet.getByRole("button", { name: "Increase Focus" }).click();
    await sheet.getByRole("button", { name: /^Short break: 5/ }).click();
    await sheet.getByLabel("Short break amount").fill("10");
    await sheet.getByLabel("Short break amount").press("Enter");
    await sheet.getByRole("button", { name: "Decrease Rounds before a long break" }).click();
    await sheet.getByRole("switch", { name: "Start breaks automatically" }).click();
    await expect
      .poll(
        async () =>
          (
            await sql(
              `select focus_min, short_break_min, long_break_min, rounds_before_long, auto_start_breaks, auto_start_focus from sp_focus_settings`,
            )
          )[0],
      )
      .toEqual({
        focus_min: 30,
        short_break_min: 10,
        long_break_min: 15,
        rounds_before_long: 3,
        auto_start_breaks: true,
        auto_start_focus: false,
      });
    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByTestId("phase-strip")).toHaveText(/Focus\s*30.*Short break\s*10/s);
    await expect(page.getByTestId("timer-clock")).toHaveText("30:00");

    if (!isPhone(info.project.name)) {
      // Space starts and pauses (once the sheet has finished closing).
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page.locator("main").click({ position: { x: 5, y: 5 } });
      await page.keyboard.press("Space");
      await expect(focus(page)).toHaveAttribute("data-status", "running");
      await expect(page.getByTestId("timer-caption")).toHaveText("Round 1 of 3");
      await page.keyboard.press("Space");
      await expect(focus(page)).toHaveAttribute("data-status", "paused");
    } else {
      await page.getByRole("button", { name: "Start focus" }).click();
      await expect(focus(page)).toHaveAttribute("data-status", "running");
    }

    await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
    const full = page.getByTestId("focus-fullscreen");
    await expect(full.getByTestId("timer-ring")).toBeVisible();
    await expect(full.getByTestId("timer-controls")).toBeVisible();
    await full.getByRole("button", { name: "Exit fullscreen" }).click();
    await expect(full).toBeHidden();
  });

  test("block lists: create, validate sites, paste many, remove, delete", async ({ page }) => {
    await page.goto("/focus");
    await expect(page.getByTestId("blocking-card")).toContainText("No block lists yet.");
    await page.getByRole("button", { name: "Edit lists" }).click();
    await page.getByRole("button", { name: "New block list" }).click();
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Social");
    await page.getByRole("button", { name: "Create" }).click();

    const list = page.getByTestId("block-list").filter({ hasText: "Social" });
    await list.getByRole("button", { name: /Social 0 sites?/ }).click();
    const box = list.getByLabel("Websites to block in Social");

    await box.fill("bad_domain.com");
    await box.press("Enter");
    await expect(list.getByRole("alert")).toContainText("isn't a valid website");
    await expect(box).toHaveValue("bad_domain.com");

    await box.fill("https://www.YouTube.com/watch?v=abc");
    await box.press("Enter");
    await expect(list.getByRole("list", { name: "Sites in Social" })).toContainText("youtube.com");

    // Paste several lines at once: valid ones are added, duplicates and bad ones are reported.
    await box.focus();
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData(
        "text/plain",
        "reddit.com\nhttp://news.ycombinator.com/newest\nyoutube.com\nlocalhost\ntwitter.com",
      );
      const event = new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      });
      // Firefox ignores `clipboardData` in the constructor of a synthetic event.
      if (!event.clipboardData?.getData("text/plain"))
        Object.defineProperty(event, "clipboardData", { value: data });
      document.activeElement?.dispatchEvent(event);
    });
    await expect(
      list.getByRole("list", { name: "Sites in Social" }).getByRole("listitem"),
    ).toHaveText([/news\.ycombinator\.com/, /reddit\.com/, /twitter\.com/, /youtube\.com/]);
    await expect(list.getByRole("alert")).toContainText("localhost");
    await expect(list.getByRole("alert")).toContainText("youtube.com is already in this list.");
    await expect
      .poll(async () =>
        (await sql(`select pattern from sp_block_list_sites order by pattern`)).map(
          (r) => r.pattern,
        ),
      )
      .toEqual(["news.ycombinator.com", "reddit.com", "twitter.com", "youtube.com"]);

    await list.getByRole("button", { name: "Remove reddit.com" }).click();
    await expect
      .poll(async () => (await sql(`select count(*)::int as n from sp_block_list_sites`))[0]?.n)
      .toBe(3);

    await page.getByRole("button", { name: "Close" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page
      .getByTestId("blocking-card")
      .getByRole("button", { name: /^Social/ })
      .click();
    await expect(page.getByTestId("blocking-card")).toContainText("Social · 3 sites");
    await expect
      .poll(
        async () =>
          (await sql(`select cardinality(active_block_list_ids) as n from sp_focus_settings`))[0]
            ?.n,
      )
      .toBe(1);

    // Deleting an active list also switches it off.
    await page.getByRole("button", { name: "Edit lists" }).click();
    await page.getByRole("button", { name: "Edit Social" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Its 3 sites are removed with it.")).toBeVisible();
    await page.getByRole("button", { name: "Delete" }).last().click();
    await expect(page.getByTestId("block-list")).toHaveCount(0);
    await expect
      .poll(
        async () =>
          (await sql(`select cardinality(active_block_list_ids) as n from sp_focus_settings`))[0]
            ?.n,
      )
      .toBe(0);
  });

  test("push subscriptions can be registered and removed", async ({ page }) => {
    const sub = {
      endpoint: "https://push.example.com/send/abc123",
      keys: { p256dh: "BPubKey", auth: "AuthSecret" },
    };
    expect((await page.request.post("/api/v1/push/subscriptions", { data: sub })).status()).toBe(
      201,
    );
    expect((await page.request.post("/api/v1/push/subscriptions", { data: sub })).status()).toBe(
      201,
    );
    expect((await sql(`select count(*)::int as n from sp_push_subscriptions`))[0]?.n).toBe(1);
    expect(
      (
        await page.request.post("/api/v1/push/subscriptions", {
          data: { endpoint: "http://insecure.example.com", keys: sub.keys },
        })
      ).status(),
    ).toBe(400);
    // The keys are not real, so nothing is delivered; the endpoint still answers with the counts.
    const test = await page.request.post("/api/v1/push/test");
    expect(test.ok()).toBe(true);
    expect(
      (
        await page.request.delete("/api/v1/push/subscriptions", {
          data: { endpoint: sub.endpoint },
        })
      ).ok(),
    ).toBe(true);
    expect((await sql(`select count(*)::int as n from sp_push_subscriptions`))[0]?.n).toBe(0);
  });
});
