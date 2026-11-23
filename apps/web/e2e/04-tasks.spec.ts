import type { Page } from "@playwright/test";
import {
  ensureConfigured,
  expect,
  isPhone,
  isTouch,
  signIn,
  sql,
  swipe as touchSwipe,
  test,
  wipeData,
} from "./helpers";

const OWNER = "(select id from auth.users where email = 'owner@stellar.local')";

async function seedMockup(): Promise<void> {
  await sql(`
    insert into sp_tasks (user_id, name, description, due_date, due_time) values
      (${OWNER}, 'Renew passport', 'Photos are in the desk drawer', sp__today(${OWNER}) - 4, null),
      (${OWNER}, 'Reply to landlord about lease', null, sp__today(${OWNER}) - 2, null),
      (${OWNER}, 'Book dentist appointment', 'Ask about Saturday slots', sp__today(${OWNER}) - 1, null),
      (${OWNER}, 'Draft Q1 roadmap', 'Outline three themes, share with Priya', sp__today(${OWNER}), '10:00'),
      (${OWNER}, 'Grocery run', null, sp__today(${OWNER}), '13:30'),
      (${OWNER}, 'Call Mom', null, sp__today(${OWNER}), '18:00'),
      (${OWNER}, 'Review pull request #142', 'Auth refactor', sp__today(${OWNER}), null),
      (${OWNER}, 'Plan the weekend', null, sp__today(${OWNER}) + 1, null),
      (${OWNER}, 'Someday maybe', null, null, null)`);
  await sql(`
    with l as (
      insert into sp_task_lists (user_id, name, emoji, sort_order) values
        (${OWNER}, 'Groceries', '🛒', 1024), (${OWNER}, 'Reading', '📚', 2048), (${OWNER}, 'Apartment', '🏠', 3072),
        (${OWNER}, 'Japan trip', '✈️', 4096), (${OWNER}, 'Ideas', '💡', 5120), (${OWNER}, 'Gift ideas', '🎁', 6144)
      returning id, name)
    insert into sp_tasks (user_id, name, list_id)
    select ${OWNER}, l.name || ' item ' || g, l.id from l, generate_series(1, 3) g`);
}

async function openTab(page: Page, name: string): Promise<void> {
  await page.getByRole("radio", { name, exact: true }).click();
}

const rows = (page: Page, list: string) =>
  page.getByRole("list", { name: list }).getByTestId("task-row");

test.describe("tasks", () => {
  test.beforeAll(async ({ request }) => {
    await ensureConfigured(request);
  });
  test.beforeEach(async ({ context }) => {
    await wipeData();
    await signIn(context);
  });

  test("Today matches the design: overdue, today, lists", async ({ page, shot }, info) => {
    await seedMockup();
    await page.goto("/tasks");
    await expect(page.getByRole("heading", { name: "Tasks", level: 1 })).toBeVisible();
    await expect(page.getByText("Overdue · 3")).toBeVisible();
    await expect(page.getByText("Today · 4")).toBeVisible();
    await expect(rows(page, "Overdue tasks")).toHaveText([
      /Renew passport/,
      /Reply to landlord/,
      /Book dentist/,
    ]);
    // Earliest due first; untimed tasks last.
    await expect(rows(page, "Today's tasks")).toHaveText([
      /Draft Q1 roadmap.*10:00 AM/,
      /Grocery run.*1:30 PM/,
      /Call Mom.*6:00 PM/,
      /Review pull request #142.*Today/,
    ]);
    // List tasks never show up here.
    await expect(page.getByTestId("today-tab")).not.toContainText("Groceries item");
    await shot("tasks-today");

    if (isPhone(info.project.name)) {
      await openTab(page, "Lists");
      await expect(page.getByTestId("list-card")).toHaveCount(6);
      await shot("tasks-lists");
    } else {
      await expect(page.getByTestId("task-lists").getByTestId("list-card")).toHaveCount(6);
      await expect(page.getByTestId("list-card").first()).toContainText("Groceries");
      await expect(page.getByTestId("list-card").first()).toContainText("3 tasks");
    }
  });

  test("quick add: today by default, a date, a description, or a list", async ({ page }, info) => {
    await sql(
      `insert into sp_task_lists (user_id, name, emoji) values (${OWNER}, 'Groceries', '🛒')`,
    );
    await page.goto("/tasks");
    const name = page.getByLabel("Task name");
    await expect(page.getByTestId("today-tab").getByText("Clear skies.")).toBeVisible();

    // Enter submits; on the Today tab the task is due today.
    await name.fill("Water the plants");
    await name.press("Enter");
    await expect(rows(page, "Today's tasks")).toHaveText([/Water the plants/]);
    await expect(name).toHaveValue("");

    // A different date keeps it out of Today.
    await name.fill("Plan the weekend");
    await page.getByRole("button", { name: /Due date/ }).click();
    await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
    if (isPhone(info.project.name)) await page.getByRole("button", { name: "Done" }).click();
    else await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Description" }).click();
    await page.getByRole("textbox", { name: "Description" }).fill("Check the forecast");
    await page.getByRole("button", { name: "Done" }).click();
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByTestId("today-tab")).not.toContainText("Plan the weekend");

    // Choosing a list clears and disables the due date.
    await name.fill("Oat milk");
    await page.getByRole("button", { name: "List", exact: true }).click();
    await page.getByRole("option", { name: /Groceries/ }).click();
    await expect(page.getByRole("button", { name: "Due date", exact: true })).toBeDisabled();
    await name.press("Enter");
    await expect(page.getByTestId("today-tab")).not.toContainText("Oat milk");

    await openTab(page, "All");
    const all = page.getByTestId("all-tab");
    await expect(all.getByRole("region", { name: "Tomorrow" })).toContainText("Plan the weekend");
    await expect(all.getByRole("region", { name: "Tomorrow" })).toContainText("Check the forecast");
    await expect(all).not.toContainText("Oat milk");

    await expect
      .poll(async () =>
        sql(
          `select name, list_id is not null as listed, due_date - sp__today(user_id) as days, description from sp_tasks order by created_at`,
        ),
      )
      .toEqual([
        { name: "Water the plants", listed: false, days: 0, description: null },
        { name: "Plan the weekend", listed: false, days: 1, description: "Check the forecast" },
        { name: "Oat milk", listed: true, days: null, description: null },
      ]);
  });

  test("move all overdue to today, then undo", async ({ page }) => {
    await seedMockup();
    await page.goto("/tasks");
    await expect(page.getByText("Overdue · 3")).toBeVisible();
    await page.getByRole("button", { name: "Move all to today" }).click();
    await expect(page.getByText("Overdue ·")).toBeHidden();
    await expect(page.getByText("Today · 7")).toBeVisible();
    await expect(page.getByText("Moved 3 tasks to today")).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await sql(
              `select count(*)::int as n from sp_tasks where due_date < sp__today(user_id) and not completed`,
            )
          )[0]?.n,
      )
      .toBe(0);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByText("Overdue · 3")).toBeVisible();
    await expect(page.getByText("Today · 4")).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await sql(
              `select (sp__today(user_id) - due_date)::int as d from sp_tasks where name = 'Renew passport'`,
            )
          )[0]?.d,
      )
      .toBe(4);
  });

  test("completing fills the checkbox at once, the row lingers, and Undo brings it back", async ({
    page,
  }) => {
    await seedMockup();
    await page.goto("/tasks");
    const row = page.getByTestId("task-row").filter({ hasText: "Grocery run" });
    const box = row.getByRole("checkbox");
    await box.click();
    // Optimistic: checked immediately, still visible while it lingers.
    await expect(box).toBeChecked();
    await expect(row).toBeVisible();
    await expect(row).toBeHidden({ timeout: 3000 });
    await expect(page.getByText("Today · 3")).toBeVisible();
    await expect(page.getByText("Task completed")).toBeVisible();
    await expect
      .poll(
        async () =>
          (await sql(`select completed from sp_tasks where name = 'Grocery run'`))[0]?.completed,
      )
      .toBe(true);
    await expect
      .poll(
        async () =>
          (await sql(`select coalesce(sum(points), 0)::int as p from sp_universe_events`))[0]?.p,
      )
      .toBe(10);

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(row).toBeVisible();
    await expect(row.getByRole("checkbox")).not.toBeChecked();
    await expect
      .poll(
        async () =>
          (await sql(`select coalesce(sum(points), 0)::int as p from sp_universe_events`))[0]?.p,
      )
      .toBe(0);

    // "Show completed" reveals finished tasks, struck through.
    await row.getByRole("checkbox").click();
    await expect(row).toBeHidden({ timeout: 3000 });
    await page.getByRole("switch", { name: "Show completed" }).click();
    await expect(rows(page, "Completed today")).toHaveText([/Grocery run/]);
    await page.getByRole("switch", { name: "Show completed" }).click();
  });

  test("task detail: edit, move to a list (clears dates), delete with undo", async ({ page }) => {
    await seedMockup();
    await page.goto("/tasks");
    await page.getByRole("button", { name: "Edit “Call Mom”" }).click();
    const sheet = page.getByTestId("task-sheet");
    await sheet.getByLabel("Name").fill("Call Mom and Dad");
    await sheet.getByLabel("Description").fill("Ask about the trip");
    await sheet.getByLabel("List").selectOption({ label: "🛒 Groceries" });
    await expect(sheet.getByRole("button", { name: "Due date", exact: true })).toBeDisabled();
    await sheet.getByRole("button", { name: "Done" }).click();
    await expect(page.getByTestId("today-tab")).not.toContainText("Call Mom");
    await expect
      .poll(
        async () =>
          (
            await sql(
              `select name, description, due_date, due_time, list_id is not null as listed from sp_tasks where name like 'Call Mom%'`,
            )
          )[0],
      )
      .toEqual({
        name: "Call Mom and Dad",
        description: "Ask about the trip",
        due_date: null,
        due_time: null,
        listed: true,
      });

    await page.getByRole("button", { name: "Edit “Grocery run”" }).click();
    await page.getByTestId("task-sheet").getByRole("button", { name: "Delete" }).click();
    await expect(page.getByTestId("today-tab")).not.toContainText("Grocery run");
    await expect
      .poll(
        async () =>
          (
            await sql(
              `select deleted_at is not null as gone from sp_tasks where name = 'Grocery run'`,
            )
          )[0]?.gone,
      )
      .toBe(true);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("today-tab")).toContainText("Grocery run");
    await expect
      .poll(
        async () =>
          (
            await sql(
              `select deleted_at is not null as gone from sp_tasks where name = 'Grocery run'`,
            )
          )[0]?.gone,
      )
      .toBe(false);
  });

  test("lists: create with an emoji, add items, reorder, rename, delete", async ({
    page,
  }, info) => {
    await page.goto("/tasks");
    if (isPhone(info.project.name)) await openTab(page, "Lists");
    const panel = page.getByTestId("task-lists").filter({ visible: true });
    await expect(panel.getByText("No lists yet.")).toBeVisible();

    for (const [name, query, emoji] of [
      ["Groceries", "cart", "🛒"],
      ["Reading", "books", "📚"],
    ] as const) {
      await panel.getByRole("button", { name: "New task list" }).click();
      await page.getByRole("button", { name: /^Emoji/ }).click();
      await page.getByLabel("Search emoji").fill(query);
      await page
        .getByRole("gridcell", {
          name: new RegExp(query === "cart" ? "Shopping cart" : "Books", "i"),
        })
        .first()
        .click();
      await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
      await page.getByRole("button", { name: "Create" }).click();
      await expect(panel.getByTestId("list-card").filter({ hasText: name })).toContainText(emoji);
    }
    await expect(panel.getByTestId("list-card")).toHaveText([
      /Groceries.*0 tasks/,
      /Reading.*0 tasks/,
    ]);

    // Keyboard reorder: focus the handle, Space to lift, arrow, Space to drop.
    await expect(page.getByRole("dialog")).toHaveCount(0);
    // The drag sensor attaches its key listeners after React commits, so pace the keys like a person would.
    await panel.getByRole("button", { name: "Reorder Reading" }).focus();
    for (const key of ["Space", "ArrowLeft", "Space"]) {
      await page.keyboard.press(key);
      await page.waitForTimeout(200);
    }
    await expect(panel.getByTestId("list-card")).toHaveText([/Reading/, /Groceries/]);
    await expect
      .poll(async () =>
        (await sql(`select name from sp_task_lists order by sort_order`)).map((r) => r.name),
      )
      .toEqual(["Reading", "Groceries"]);

    // List detail has its own quick add with no date chip.
    await panel.getByRole("button", { name: "Open Groceries" }).click();
    await expect(page).toHaveURL(/list=/);
    const detail = page.getByTestId("list-detail");
    await expect(detail.getByRole("button", { name: /Due date/ })).toHaveCount(0);
    for (const item of ["Oat milk", "Bananas"]) {
      await detail.getByLabel("Task name").fill(item);
      await detail.getByLabel("Task name").press("Enter");
    }
    await expect(rows(page, "Groceries tasks")).toHaveText([/Oat milk/, /Bananas/]);

    await detail.getByRole("button", { name: "Edit list" }).click();
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Food shop");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(detail.getByRole("heading", { name: "Food shop" })).toBeVisible();

    // The list's tasks are nowhere else.
    await page.goBack();
    if (isPhone(info.project.name)) await openTab(page, "All");
    else await openTab(page, "All");
    await expect(page.getByTestId("all-tab")).not.toContainText("Oat milk");
    await openTab(page, "Calendar");
    await expect(page.getByTestId("calendar-tab")).not.toContainText("Oat milk");

    // Delete asks first, removes the list with its tasks, and can be undone.
    if (isPhone(info.project.name)) await openTab(page, "Lists");
    await page
      .getByTestId("task-lists")
      .filter({ visible: true })
      .getByRole("button", { name: "Open Food shop" })
      .click();
    await page.getByTestId("list-detail").getByRole("button", { name: "Edit list" }).click();
    await page.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByText("Its 2 tasks are deleted with it.")).toBeVisible();
    await page.getByRole("button", { name: "Delete" }).last().click();
    await expect(page.getByTestId("list-detail")).toBeHidden();
    await expect
      .poll(
        async () =>
          (await sql(`select count(*)::int as n from sp_tasks where deleted_at is null`))[0]?.n,
      )
      .toBe(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect
      .poll(
        async () =>
          (await sql(`select count(*)::int as n from sp_tasks where deleted_at is null`))[0]?.n,
      )
      .toBe(2);
  });

  test("calendar: pick a day, add to it, reschedule", async ({ page, shot }, info) => {
    await seedMockup();
    await page.goto("/tasks?tab=calendar");
    const cal = page.getByTestId("calendar-tab");
    await expect(cal.getByRole("region", { name: "Agenda" })).toContainText("Draft Q1 roadmap");
    await shot("tasks-calendar");

    // Tomorrow's agenda, and quick add is prefilled with the selected day.
    const tomorrow = (
      await sql<{ d: string }>(`select to_char(sp__today(${OWNER}) + 1, 'YYYY-MM-DD') as d`)
    )[0]!.d;
    const today = (
      await sql<{ d: string }>(`select to_char(sp__today(${OWNER}), 'YYYY-MM-DD') as d`)
    )[0]!.d;
    const sameMonth = tomorrow.slice(0, 7) === today.slice(0, 7);
    if (!sameMonth) await cal.getByRole("button", { name: "Next month" }).click();
    await cal.locator(`[data-date="${tomorrow}"]`).first().getByRole("button").first().click();
    await expect(cal.getByRole("region", { name: "Agenda" })).toContainText("Plan the weekend");
    await page.getByLabel("Task name").fill("Pack a picnic");
    await page.getByLabel("Task name").press("Enter");
    await expect(cal.getByRole("region", { name: "Agenda" })).toContainText("Pack a picnic");
    await expect
      .poll(
        async () =>
          (
            await sql(
              `select to_char(due_date, 'YYYY-MM-DD') as d from sp_tasks where name = 'Pack a picnic'`,
            )
          )[0]?.d,
      )
      .toBe(tomorrow);

    if (!isPhone(info.project.name) && sameMonth) {
      // Desktop: drag a pill onto another day.
      const pill = cal.getByTestId("calendar-pill").filter({ hasText: "Pack a picnic" });
      const target = cal.locator(`[data-date="${today}"]`).first();
      await pill.scrollIntoViewIfNeeded();
      const from = (await pill.boundingBox())!;
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 4, {
        steps: 3,
      });
      // The page may auto-scroll while dragging, so aim at the target where it is now.
      for (let i = 0; i < 3; i++) {
        const to = (await target.boundingBox())!;
        await page.mouse.move(to.x + to.width / 2, to.y + Math.min(to.height - 12, 60), {
          steps: 6,
        });
        await page.waitForTimeout(120);
      }
      await page.mouse.up();
      await expect
        .poll(
          async () =>
            (
              await sql(
                `select to_char(due_date, 'YYYY-MM-DD') as d from sp_tasks where name = 'Pack a picnic'`,
              )
            )[0]?.d,
        )
        .toBe(today);
      // Week view shows the same days in more detail.
      await cal.getByRole("radio", { name: "Week" }).click();
      await expect(cal.getByRole("heading", { name: /Week of/ })).toBeVisible();
      await expect(cal.locator("[data-date]")).toHaveCount(7);
      await cal.getByRole("radio", { name: "Month" }).click();
    }
  });

  test("swipe right completes, swipe left offers Reschedule and Delete", async ({ page }, info) => {
    test.skip(!isTouch(info.project.name), "swipe actions are for touch devices");
    await seedMockup();
    await page.goto("/tasks");
    const swipe = async (text: string, dx: number) => {
      const row = page.getByTestId("task-row").filter({ hasText: text });
      await row.scrollIntoViewIfNeeded();
      const box = (await row.boundingBox())!;
      const x = dx > 0 ? box.x + 100 : box.x + box.width - 60;
      await touchSwipe(page, { x, y: box.y + box.height / 2 }, dx);
    };
    await swipe("Grocery run", 150);
    await expect(page.getByTestId("task-row").filter({ hasText: "Grocery run" })).toBeHidden({
      timeout: 4000,
    });
    await expect
      .poll(
        async () =>
          (await sql(`select completed from sp_tasks where name = 'Grocery run'`))[0]?.completed,
      )
      .toBe(true);

    await swipe("Call Mom", -150);
    await page.getByRole("button", { name: "Reschedule “Call Mom”" }).click();
    await page.getByRole("button", { name: "Tomorrow", exact: true }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByTestId("today-tab")).not.toContainText("Call Mom");
    // The reschedule sheet is still on screen while it animates out.
    await expect(page.getByRole("dialog")).toHaveCount(0);

    await swipe("Draft Q1 roadmap", -150);
    await page.getByRole("button", { name: "Delete “Draft Q1 roadmap”" }).click();
    await expect(page.getByText("Task deleted")).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await sql(
              `select deleted_at is not null as gone from sp_tasks where name = 'Draft Q1 roadmap'`,
            )
          )[0]?.gone,
      )
      .toBe(true);
  });
});
