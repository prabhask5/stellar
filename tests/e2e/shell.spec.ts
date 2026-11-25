import {
  ensureConfigured,
  expect,
  insetsFor,
  isPhone,
  signIn,
  SUPABASE_URL,
  sql,
  test,
  uniqueIp,
  wipeData,
  hydrated,
} from "./support/helpers";

test.describe("app shell", () => {
  test.beforeAll(async ({ request }) => {
    await ensureConfigured(request);
    await wipeData();
  });
  test.beforeEach(async ({ context }) => {
    await signIn(context);
  });

  test("home shows the greeting and an empty Today card", async ({ page, shot }, info) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /Good (morning|afternoon|evening|night)/,
    );
    const card = page.getByTestId("today-card");
    await expect(card.getByText("Clear skies. Nothing left in orbit today.")).toBeVisible();
    await expect(card.getByText("None today")).toBeVisible();
    await shot("home-empty");

    // Navigation adapts: floating tab bar on phones, sidebar on desktop.
    const nav = page.getByRole("navigation", { name: "Main" }).filter({ visible: true });
    await expect(nav).toHaveCount(1);
    await expect(nav.getByRole("link", { name: "Universe" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    if (isPhone(info.project.name)) {
      const box = (await nav.boundingBox())!;
      const viewport = page.viewportSize()!;
      const bottomInset = insetsFor(info.project.name) === "island" ? 34 : 12;
      expect(Math.round(viewport.height - (box.y + box.height))).toBe(bottomInset);
      // The Today card clears the tab bar.
      const cardBox = (await card.boundingBox())!;
      await card.scrollIntoViewIfNeeded();
      expect(cardBox.height).toBeGreaterThan(100);
      await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
    }
  });

  test("settings persist, and Undo restores a removed quote", async ({ page, shot }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
    await page.getByLabel("Time zone").selectOption("Asia/Tokyo");
    await page.getByRole("radio", { name: "Sun" }).click();
    await page.getByLabel("Birthdate").fill("1988-02-29");
    await page.getByLabel("Expected lifespan").fill("95");
    await page.getByLabel("Expected lifespan").blur();
    await page.getByRole("radio", { name: /Balanced/ }).click();
    await page.getByLabel("Lock after inactivity").selectOption("60");
    await expect
      .poll(
        async () =>
          (
            await sql(
              "select timezone, week_start, to_char(birthdate,'YYYY-MM-DD') as birthdate, lifespan_years, quality_tier, lock_after_minutes from sp_settings",
            )
          )[0],
      )
      .toEqual({
        timezone: "Asia/Tokyo",
        week_start: 0,
        birthdate: "1988-02-29",
        lifespan_years: 95,
        quality_tier: "balanced",
        lock_after_minutes: 60,
      });

    await page.getByLabel("Quote", { exact: true }).fill("Stay curious.");
    await page.getByLabel("Author").fill("Me");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const quotes = page.getByRole("list", { name: "Your quotes" });
    await expect(quotes).toContainText("Stay curious.");
    await quotes.getByRole("button", { name: /Remove quote/ }).click();
    await expect(page.getByText("Quote removed")).toBeVisible();
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(quotes).toContainText("Stay curious.");
    await expect
      .poll(
        async () =>
          (await sql("select count(*)::int as n from sp_quotes where not is_builtin"))[0]?.n,
      )
      .toBe(1);

    await expect(page.getByTestId("devices")).toContainText("This device");
    await expect(page.getByTestId("connection")).toContainText("Connected");
    await expect(page.getByTestId("connection")).toContainText(new URL(SUPABASE_URL).host);
    await shot("settings");

    // Reload: everything comes back from the server (and from the persisted cache first).
    await page.reload();
    await expect(page.getByLabel("Time zone")).toHaveValue("Asia/Tokyo");
    await expect(page.getByRole("radio", { name: /Balanced/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await sql(
      "update sp_settings set timezone = 'UTC', week_start = 1, lock_after_minutes = null, quality_tier = 'minimal'",
    );
  });

  test("export downloads everything and import merges it back", async ({ page }) => {
    await sql(
      "insert into sp_tasks (user_id, name) select id, 'Exported task' from auth.users where email = 'owner@stellar.local'",
    );
    await page.goto("/settings");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export" }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/^stellar-planner-\d{4}-\d{2}-\d{2}\.json$/);
    const path = await download.path();
    const { readFileSync } = await import("node:fs");
    const dump = JSON.parse(readFileSync(path, "utf8"));
    expect(dump.format).toBe("stellar-planner-export");
    expect(dump.tasks.map((t: { name: string }) => t.name)).toContain("Exported task");

    await sql("delete from sp_tasks where name = 'Exported task'");
    await page.getByLabel("Import file").setInputFiles(path);
    await page.getByRole("dialog").getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.getByText(/Imported \d+ items/)).toBeVisible();
    expect(
      (await sql("select count(*)::int as n from sp_tasks where name = 'Exported task'"))[0]?.n,
    ).toBe(1);

    await page.getByLabel("Import file").setInputFiles({
      name: "nope.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"hello":1}'),
    });
    await expect(page.getByText("That file is not a Stellar Planner export.")).toBeVisible();
    await sql("delete from sp_tasks where name = 'Exported task'");
  });

  test("command bar adds a task and jumps between pages", async ({ page }, info) => {
    test.skip(isPhone(info.project.name), "⌘K is a desktop feature");
    await page.goto("/settings");
    await hydrated(page);
    await page.keyboard.press("ControlOrMeta+k");
    const input = page.getByRole("combobox", { name: "Command" });
    await expect(input).toBeFocused();
    await input.fill("Water the plants");
    await expect(page.getByRole("option", { name: /Add task “Water the plants”/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.keyboard.press("Enter");
    await expect(page.getByText("Task added for today")).toBeVisible();
    await expect
      .poll(
        async () =>
          (
            await sql(
              "select due_date = sp__today(user_id) as today from sp_tasks where name = 'Water the plants'",
            )
          )[0]?.today,
      )
      .toBe(true);

    await page.keyboard.press("ControlOrMeta+k");
    await input.fill("universe");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByTestId("today-card")).toContainText("Water the plants");
    // Number keys jump between pages (the other destinations are covered by their own specs).
    await page.keyboard.press("ControlOrMeta+k");
    await input.fill("settings");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/settings$/);
    await page.keyboard.press("1");
    await expect(page).toHaveURL(/\/$/);
    await sql("delete from sp_tasks where name = 'Water the plants'");
  });

  test("two devices reflect each other within about a second", async ({
    page,
    browser,
    baseURL,
  }, info) => {
    const other = await browser.newContext({
      ...info.project.use,
      baseURL,
      extraHTTPHeaders: { "x-forwarded-for": uniqueIp() },
    });
    await signIn(other);
    const page2 = await other.newPage();
    await Promise.all([page.goto("/"), page2.goto("/")]);
    const card1 = page.getByTestId("today-card");
    const card2 = page2.getByTestId("today-card");
    await expect(card1.getByText("Clear skies.")).toBeVisible();
    await expect(card2.getByText("Clear skies.")).toBeVisible();
    // Give both Realtime channels a moment to join.
    await page.waitForTimeout(1500);

    // A change made anywhere (here: straight in the database, as another client would) reaches both.
    await sql(
      "insert into sp_tasks (user_id, name, due_date) select id, 'Synced task', sp__today(id) from auth.users where email = 'owner@stellar.local'",
    );
    await expect(card1.getByText("Synced task")).toBeVisible({ timeout: 4000 });
    await expect(card2.getByText("Synced task")).toBeVisible({ timeout: 4000 });

    // Completing it on one device removes it on the other.
    const started = Date.now();
    await card1.getByRole("checkbox", { name: /Complete “Synced task”/ }).click();
    await expect(card1.getByRole("checkbox").first()).toBeChecked();
    await expect(card2.getByText("Synced task")).toBeHidden({ timeout: 4000 });
    expect(Date.now() - started).toBeLessThan(4000);
    await expect(page.getByText("Task completed")).toBeVisible();
    await expect(card1.getByText("1 / 1")).toBeVisible();

    // Undo travels too.
    await page.getByRole("button", { name: "Undo" }).click();
    await expect(card2.getByText("Synced task")).toBeVisible({ timeout: 4000 });
    await other.close();
    await sql("delete from sp_tasks where name = 'Synced task'");
  });
});
