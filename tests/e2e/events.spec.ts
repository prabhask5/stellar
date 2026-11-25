// Upcoming events on the Goals page: add, live countdown in the owner's time zone, the
// phone and desktop layouts, edit, delete with Undo.
import { ensureConfigured, expect, isPhone, signIn, sql, test, wipeData } from "./support/helpers";
import { expectInvariants } from "./support/invariants";

const OWNER = "(select id from auth.users where email = 'owner@stellar.local')";

test.describe("upcoming events", () => {
  test.beforeAll(async ({ request }) => {
    await ensureConfigured(request);
  });
  test.beforeEach(async ({ context }) => {
    await wipeData();
    await signIn(context);
  });

  test("add an event, watch it count down, edit it, delete it and undo", async ({ page }, info) => {
    await page.goto("/goals");
    const section = page.getByTestId("upcoming-events");
    await expect(section.getByRole("heading", { name: "Upcoming events" })).toBeVisible();
    await expect(section).toContainText("Nothing to count down to yet");
    // Between the time card and the goal lists.
    const order = await page.evaluate(() => {
      const top = (sel: string) => document.querySelector(sel)!.getBoundingClientRect().top;
      return [top('[data-testid="upcoming-events"]'), top('[data-testid="goal-lists"]')];
    });
    expect(order[0]).toBeLessThan(order[1]!);

    await section.getByRole("button", { name: "New event" }).click();
    const sheet = page.getByRole("dialog", { name: "New event" });
    const add = sheet.getByRole("button", { name: "Add event" });
    await sheet.getByLabel("Name").fill("Product launch");
    // A name alone is not an event: it needs its day.
    await expect(add).toBeDisabled();
    await sheet.getByRole("button", { name: "Date" }).click();
    await page.getByRole("button", { name: "Tomorrow" }).click();
    const done = page.getByRole("button", { name: "Done" });
    if (await done.isVisible().catch(() => false)) await done.click();
    else await page.keyboard.press("Escape");
    await expect(add).toBeEnabled();
    await add.click();
    await expect(sheet).toHaveCount(0);

    const featured = section.getByTestId("event-featured");
    await expect(featured).toContainText("Product launch");
    await expect(featured).toContainText("Next up");
    await expect(featured).toHaveAttribute(
      "data-layout",
      isPhone(info.project.name) ? "phone" : "desktop",
    );
    await expect
      .poll(async () => (await sql(`select name, time from sp_events`))[0])
      .toEqual({ name: "Product launch", time: null });

    // It is live: the text changes from one second to the next.
    const first = await featured.innerText();
    await expect.poll(() => featured.innerText(), { timeout: 4000 }).not.toBe(first);
    await expectInvariants(page, "an upcoming event");

    // Edit: rename.
    await featured.click();
    const edit = page.getByRole("dialog", { name: "Edit event" });
    await edit.getByLabel("Name").fill("Launch day");
    await edit.getByRole("button", { name: "Save" }).click();
    await expect(featured).toContainText("Launch day");
    await expect
      .poll(async () => (await sql(`select name from sp_events`))[0]?.name)
      .toBe("Launch day");

    // Delete, then Undo brings the same event back.
    await featured.click();
    await page
      .getByRole("dialog", { name: "Edit event" })
      .getByRole("button", { name: "Delete" })
      .click();
    await expect(section.getByTestId("event-featured")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(section.getByTestId("event-featured")).toContainText("Launch day");
    await page.waitForTimeout(1200);
    expect((await sql(`select count(*)::int as n from sp_events`))[0]?.n).toBe(1);
  });

  test("counts in the owner's time zone, nearest first, with passed events last", async ({
    page,
  }, info) => {
    // The owner lives in Tokyo; the browser does not.
    await sql(`update sp_settings set timezone = 'Asia/Tokyo' where user_id = ${OWNER}`);
    await sql(`
      insert into sp_events (user_id, name, emoji, date, time) values
        (${OWNER}, 'Thesis deadline', '🎓', sp__today(${OWNER}) + 400, '17:00'),
        (${OWNER}, 'Trip', '✈️', sp__today(${OWNER}) + 20, null),
        (${OWNER}, 'Midnight', '🌙', sp__today(${OWNER}) + 1, null),
        (${OWNER}, 'Last week', '📦', sp__today(${OWNER}) - 7, null)`);
    // What the database says is left until midnight in Tokyo.
    const [left] = await sql<{ s: number }>(
      `select extract(epoch from (((sp__today(${OWNER}) + 1)::timestamp at time zone 'Asia/Tokyo') - now()))::int as s`,
    );
    await page.goto("/goals");
    const section = page.getByTestId("upcoming-events");
    const featured = section.getByTestId("event-featured");
    await expect(featured).toContainText("Midnight");
    // The hours shown are Tokyo's, to the minute.
    const hours = Math.floor(left!.s / 3600);
    const lead = featured.locator('[data-unit="hours"]').first();
    if (hours > 0) await expect(lead).toHaveText(new RegExp(`^0?${hours}$`));
    await expect(featured.locator('[data-unit="days"]')).toHaveCount(0);

    // The rest in order of nearness; what has passed sinks to the end.
    await expect(section.getByTestId("event-item")).toHaveText([
      /Trip/,
      /Thesis deadline/,
      /Last week/,
    ]);
    await expect(section.getByTestId("event-item").nth(0)).toContainText(/2w 5d|2w 6d/);
    await expect(section.getByTestId("event-item").nth(1)).toContainText(/1y 1mo/);
    await expect(section.getByTestId("event-item").nth(2)).toContainText("Passed");

    // Phone: one large number and a line. Desktop: a tile per unit.
    if (isPhone(info.project.name)) {
      await expect(featured.getByTestId("event-stack")).toBeVisible();
      await expect(featured.getByTestId("event-tiles")).toHaveCount(0);
    } else {
      await expect(featured.getByTestId("event-tiles")).toBeVisible();
      const units = await featured
        .locator("[data-unit]")
        .evaluateAll((els) => els.map((e) => e.getAttribute("data-unit")));
      expect(units.slice(-2)).toEqual(["minutes", "seconds"]);
    }
    await expectInvariants(page, "upcoming events");
    await section.scrollIntoViewIfNeeded();
  });
});
