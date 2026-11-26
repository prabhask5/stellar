import { ensureConfigured, expect, signIn, sql, test, wipeData } from "./support/helpers";

const OWNER = "(select id from auth.users where email = 'owner@stellar.local')";

/** Four lists with known progress (Health 5 of 7, Career 3 of 8, …). */
async function seedSample(): Promise<void> {
  const lists: [string, string, number, number][] = [
    ["Health", "💪", 5, 7],
    ["Career", "💼", 3, 8],
    ["Creative", "🎸", 1, 5],
    ["Finances", "💰", 6, 7],
  ];
  for (const [i, [name, emoji, done, total]] of lists.entries()) {
    await sql(
      `with l as (insert into sp_goal_lists (user_id, name, emoji, sort_order) values (${OWNER}, $1, $2, $3) returning id)
       insert into sp_goals (user_id, list_id, name, completed)
       select ${OWNER}, l.id, $1 || ' goal ' || g, g <= $4 from l, generate_series(1, $5::int) g`,
      [name, emoji, (i + 1) * 1024, done, total],
    );
  }
}

test.describe("goals", () => {
  test.beforeAll(async ({ request }) => {
    await ensureConfigured(request);
  });
  test.beforeEach(async ({ context }) => {
    await wipeData();
    await signIn(context);
  });

  test("quote, time progress and goal lists match the design", async ({ page, shot }) => {
    await seedSample();
    await sql(
      `update sp_settings set birthdate = (sp__today(user_id) - interval '30 years')::date, lifespan_years = 90`,
    );
    await page.goto("/goals");
    await expect(page.getByRole("heading", { name: "Goals", level: 1 })).toBeVisible();

    const quote = page.getByTestId("quote-card");
    await expect(quote.locator("blockquote")).toHaveText(/^“.+”$/);
    await expect(quote.locator("figcaption")).not.toBeEmpty();

    const time = page.getByTestId("time-card");
    for (const label of ["Day", "Week", "Month", "Year", "Life"]) {
      await expect(time.getByRole("progressbar", { name: `${label} progress` })).toBeVisible();
    }
    // 30 of 90 years.
    await expect(time.getByRole("progressbar", { name: "Life progress" })).toHaveAttribute(
      "aria-valuenow",
      "33",
    );
    const day = Number(
      await time.getByRole("progressbar", { name: "Day progress" }).getAttribute("aria-valuenow"),
    );
    const utc = new Date();
    expect(
      Math.abs(day - Math.round(((utc.getUTCHours() * 60 + utc.getUTCMinutes()) / 1440) * 100)),
    ).toBeLessThanOrEqual(1);

    const cards = page.getByTestId("goal-list-card");
    await expect(cards).toHaveText([
      /Health.*5 of 7 · 71%/s,
      /Career.*3 of 8 · 38%/s,
      /Creative.*1 of 5 · 20%/s,
      /Finances.*6 of 7 · 86%/s,
    ]);
    await shot("goals");
  });

  test("without a birthdate, Life links to Settings", async ({ page }) => {
    await page.goto("/goals");
    const link = page.getByTestId("time-card").getByRole("link", { name: "Add your birthdate" });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/settings#general$/);
  });

  test("todo and progress goals drive list progress", async ({ page, shot }) => {
    await page.goto("/goals");
    await expect(page.getByText("No planets yet.")).toBeVisible();
    await page.getByRole("button", { name: "New goal list" }).click();
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Reading");
    await page.getByRole("button", { name: "Add goal list" }).click();
    await page.getByRole("button", { name: "Open Reading" }).click();
    const detail = page.getByTestId("goal-list-detail");
    await expect(detail.getByText("A planet waiting to grow.")).toBeVisible();

    // A todo goal and a progress goal.
    await detail.getByRole("button", { name: "New goal" }).first().click();
    const sheet = page.getByTestId("goal-sheet");
    await sheet.getByRole("textbox", { name: "Name", exact: true }).fill("Join a book club");
    await sheet.getByRole("button", { name: "Add goal" }).click();
    await detail.getByRole("button", { name: "New goal" }).first().click();
    await sheet.getByRole("textbox", { name: "Name", exact: true }).fill("Read books");
    await sheet.getByRole("radio", { name: /Progress/ }).click();
    await sheet.getByRole("button", { name: "Add goal" }).click();
    await expect(sheet.getByText("Enter a total above zero.")).toBeVisible();
    await sheet.getByRole("textbox", { name: "Total" }).fill("20");
    await sheet.getByRole("textbox", { name: "Unit" }).fill("books");
    await sheet.getByRole("button", { name: "Add goal" }).click();
    await expect(detail.getByTestId("goal-row")).toHaveCount(2);
    await expect(detail.getByTestId("list-progress")).toContainText("0 of 2 complete");

    // Stepper: +1, then hold is covered by unit behaviour; type an exact value.
    const books = detail.getByTestId("goal-row").filter({ hasText: "Read books" });
    await books.getByRole("button", { name: "Increase Read books" }).click();
    await expect(books).toContainText("1 / 20 books");
    await books.getByRole("button", { name: /Tap to type a value/ }).click();
    await books.getByLabel("Read books amount").fill("10");
    await books.getByLabel("Read books amount").press("Enter");
    await expect(books).toContainText("10 / 20 books");
    await expect(detail.getByTestId("list-progress")).toContainText("25%");
    await books.getByRole("button", { name: "Decrease Read books" }).click();
    await expect(books).toContainText("9 / 20 books");

    // Completing the todo goal: mean progress = (1 + 0.45) / 2.
    await detail.getByRole("checkbox", { name: "Complete “Join a book club”" }).click();
    await expect(detail.getByTestId("list-progress")).toContainText("1 of 2 complete");
    await expect(detail.getByTestId("list-progress")).toContainText("73%");
    await shot("goal-list-detail");

    // Reaching the total completes the goal, and with it the whole list.
    await books.getByRole("button", { name: /Tap to type a value/ }).click();
    await books.getByLabel("Read books amount").fill("20");
    await books.getByLabel("Read books amount").press("Enter");
    await expect(detail.getByTestId("list-progress")).toContainText("2 of 2 complete");
    await expect(detail.getByTestId("list-progress")).toContainText("100%");
    expect(
      (await sql(`select completed from sp_goals where name = 'Read books'`))[0]?.completed,
    ).toBe(true);

    // Un-completing reverses honestly.
    await detail.getByRole("checkbox", { name: /Join a book club/ }).click();

    // Back on the overview the card shows the same numbers.
    await detail.getByRole("button", { name: "Back to goals" }).click();
    await expect(page.getByTestId("goal-list-card")).toHaveText([/Reading.*1 of 2 · 50%/s]);
  });

  test("edit and delete a goal, with undo", async ({ page }) => {
    await sql(
      `with l as (insert into sp_goal_lists (user_id, name, emoji) values (${OWNER}, 'Health', '💪') returning id)
       insert into sp_goals (user_id, list_id, name, type, total_amount, unit, current_amount)
       select ${OWNER}, l.id, 'Run', 'progress', 100, 'km', 40 from l`,
    );
    await page.goto("/goals");
    await page.getByRole("button", { name: "Open Health" }).click();
    await page.getByRole("button", { name: "Edit Run" }).click();
    const sheet = page.getByTestId("goal-sheet");
    await sheet.getByRole("textbox", { name: "Name", exact: true }).fill("Run this year");
    await sheet.getByRole("textbox", { name: "Total" }).fill("200");
    await sheet.getByRole("button", { name: "Save" }).click();
    const row = page.getByTestId("goal-row");
    await expect(row).toContainText("Run this year");
    await expect(row).toContainText("40 / 200 km");
    await expect
      .poll(async () => (await sql(`select name, total_amount::int as total from sp_goals`))[0])
      .toEqual({ name: "Run this year", total: 200 });

    await page.getByRole("button", { name: "Edit Run this year" }).click();
    await sheet.getByRole("button", { name: "Delete" }).click();
    await expect(page.getByTestId("goal-row")).toHaveCount(0);
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("goal-row")).toHaveCount(1);
    await expect
      .poll(async () => (await sql(`select deleted_at is null as live from sp_goals`))[0]?.live)
      .toBe(true);
  });
});
