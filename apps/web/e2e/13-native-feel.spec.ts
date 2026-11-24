// Native-feel behaviour from polish pass 1 (POLISH_SPEC §4): instant press feedback,
// chrome that cannot be selected, 44px hit areas, tab memory, the large-title bar, sheet
// and row gestures, edge-swipe back, the universe yielding to interaction, and coming
// back where you left off.
import type { Page } from "@playwright/test";
import {
  ensureConfigured,
  expect,
  isPhone,
  isTouch,
  signIn,
  sql,
  swipe,
  test,
  wipeData,
} from "./helpers";

const OWNER = "(select id from auth.users where email = 'owner@stellar.local')";
const today = `sp__today(${OWNER})`;

async function seedTasks(n: number): Promise<void> {
  await sql(`insert into sp_tasks (user_id, name, due_date)
    select ${OWNER}, 'Task ' || lpad(g::text, 2, '0'), ${today} + (g % 9) from generate_series(1, ${n}) g`);
}

const tabBar = (page: Page) =>
  page.getByRole("navigation", { name: "Main" }).filter({ visible: true });

test.describe("native feel", () => {
  test.beforeAll(async ({ request }) => {
    await ensureConfigured(request);
  });
  test.beforeEach(async ({ context }) => {
    await wipeData();
    await signIn(context);
  });

  test("controls show pressed the moment they are touched, and let go when the finger moves away", async ({
    page,
  }) => {
    await page.goto("/tasks");
    const add = page.getByRole("radio", { name: "All", exact: true });
    await expect(add).toBeVisible();
    const state = await add.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const at = { clientX: r.x + r.width / 2, clientY: r.y + r.height / 2 };
      const fire = (type: string, extra: object = {}) =>
        el.dispatchEvent(
          new PointerEvent(type, {
            bubbles: true,
            pointerId: 3,
            pointerType: "touch",
            isPrimary: true,
            ...at,
            ...extra,
          }),
        );
      fire("pointerdown");
      // Same task as the event: no frame has passed.
      const down = el.getAttribute("data-pressed");
      fire("pointermove", { clientY: at.clientY + 30 });
      const moved = el.getAttribute("data-pressed");
      fire("pointerdown");
      fire("pointerup");
      return { down, moved, up: el.getAttribute("data-pressed") };
    });
    expect(state).toEqual({ down: "scale", moved: null, up: null });
  });

  test("chrome cannot be selected; fields and notes can", async ({ page }) => {
    await sql(
      `insert into sp_tasks (user_id, name, description, due_date) values (${OWNER}, 'Selectable?', 'A note', ${today})`,
    );
    await page.goto("/tasks");
    await expect(page.getByTestId("today-tab")).toContainText("Selectable?");
    const styles = await page.evaluate(() => {
      const read = (el: Element | null) => {
        if (!el) return null;
        const cs = getComputedStyle(el) as CSSStyleDeclaration & { webkitUserSelect?: string };
        return {
          select: cs.userSelect || cs.webkitUserSelect,
          callout: cs.getPropertyValue("-webkit-touch-callout") || "n/a",
        };
      };
      return {
        nav: read(document.querySelector('nav[aria-label="Main"] a')),
        button: read(document.querySelector('[data-testid="task-row"] button')),
        input: read(
          document.querySelector('input[aria-label="Task name"], #quick-add-name, input'),
        ),
      };
    });
    expect(styles.nav?.select).toBe("none");
    expect(styles.button?.select).toBe("none");
    expect(styles.input?.select).toBe("text");
    // -webkit-touch-callout only exists on iOS itself (desktop WebKit does not expose it), so
    // the long-press callout is on the iPhone checklist rather than asserted here.
  });

  test("small controls still have a 44px hit area on touch screens", async ({ page }, info) => {
    test.skip(!isTouch(info.project.name), "touch only");
    await sql(
      `insert into sp_tasks (user_id, name, due_date) values (${OWNER}, 'Hit me', ${today})`,
    );
    await page.goto("/tasks");
    await page.getByRole("button", { name: "Edit Hit me" }).click();
    const close = page.getByRole("button", { name: "Close" });
    await expect(close).toBeVisible();
    await page.waitForTimeout(500);
    const result = await close.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const cx = r.x + r.width / 2;
      const cy = r.y + r.height / 2;
      // 21px from the centre is outside a 32px button but inside a 44px target.
      const hits = [
        [cx - 21, cy],
        [cx, cy + 21],
      ].map(([x, y]) => {
        const hit = document.elementFromPoint(x as number, y as number);
        return hit === el || el.contains(hit);
      });
      return { size: Math.round(r.width), hits };
    });
    expect(result.size).toBeLessThan(44);
    expect(result.hits).toEqual([true, true]);
  });

  test("tabs come back as they were left; tapping the current tab scrolls up, then goes to its root", async ({
    page,
  }, info) => {
    test.skip(!isPhone(info.project.name), "tab bar");
    await seedTasks(45);
    await page.goto("/tasks");
    await page.getByRole("radio", { name: "All", exact: true }).click();
    await expect(page).toHaveURL(/tab=all/);
    await expect(page.getByTestId("all-tab")).toContainText("Task 45");
    await page.evaluate(() => window.scrollTo(0, 700));
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(700);

    // The compact title bar replaces the large title once it has scrolled away.
    await expect(page.getByTestId("compact-title")).toHaveAttribute("data-shown", "true");
    await expect(page.getByTestId("compact-title")).toHaveText("Tasks");

    await tabBar(page).getByRole("link", { name: "Goals" }).click();
    await expect(page.getByRole("heading", { name: "Goals", level: 1 })).toBeVisible();
    expect(await page.evaluate(() => Math.round(window.scrollY))).toBe(0);

    await tabBar(page).getByRole("link", { name: "Tasks" }).click();
    await expect(page).toHaveURL(/\/tasks\?tab=all/);
    await expect(page.getByTestId("all-tab")).toBeVisible();
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(700);

    // Tap the tab you are on: to the top.
    await tabBar(page).getByRole("link", { name: "Tasks" }).click();
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(0);
    await expect(page.getByTestId("compact-title")).not.toHaveAttribute("data-shown", "true");
    // And again: back to the tab's first screen.
    await tabBar(page).getByRole("link", { name: "Tasks" }).click();
    await expect(page).toHaveURL(/\/tasks$/);
    await expect(page.getByTestId("today-tab")).toBeVisible();
  });

  test("only one row is open at a time, scrolling closes it, and a full swipe deletes", async ({
    page,
  }, info) => {
    test.skip(!isTouch(info.project.name), "touch only");
    await seedTasks(18);
    await page.goto("/tasks?tab=all");
    await page.getByRole("radio", { name: "All", exact: true }).click();
    const row = (n: string) => page.getByTestId("task-row").filter({ hasText: `Task ${n}` });
    const swipeRow = async (n: string, dx: number) => {
      const box = (await row(n).boundingBox())!;
      await swipe(page, { x: box.x + box.width - 50, y: box.y + box.height / 2 }, dx);
    };
    const offset = (n: string) =>
      row(n).evaluate((el) => {
        const moving = el.lastElementChild as HTMLElement;
        return Math.round(new DOMMatrixReadOnly(getComputedStyle(moving).transform).m41);
      });

    await swipeRow("09", -150);
    await expect(page.getByRole("button", { name: "Delete “Task 09”" })).toBeVisible();
    await expect.poll(() => offset("09")).toBe(-148);
    await swipeRow("18", -150);
    await expect.poll(() => offset("18")).toBe(-148);
    await expect.poll(() => offset("09")).toBe(0);

    await page.evaluate(() => window.scrollBy(0, 120));
    await expect.poll(() => offset("18")).toBe(0);

    const before = (
      await sql(`select count(*)::int as n from sp_tasks where deleted_at is null`)
    )[0]!.n;
    await page.evaluate(() => window.scrollTo(0, 0));
    await swipeRow("09", -290);
    await expect(page.getByText("Task deleted")).toBeVisible();
    await expect
      .poll(
        async () =>
          (await sql(`select count(*)::int as n from sp_tasks where deleted_at is null`))[0]!.n,
      )
      .toBe(before - 1);
  });

  test("a swipe from the left edge goes back from a list, and a short one springs home", async ({
    page,
  }, info) => {
    test.skip(!isPhone(info.project.name), "phone gesture");
    await sql(
      `insert into sp_task_lists (user_id, name, emoji) values (${OWNER}, 'Groceries', '🛒')`,
    );
    await page.goto("/tasks?tab=lists");
    await page.getByRole("button", { name: "Open Groceries" }).click();
    await expect(page.getByTestId("list-detail")).toBeVisible();
    await expect(page).toHaveURL(/list=/);
    const viewport = page.viewportSize()!;
    const y = viewport.height / 2;

    await swipe(page, { x: 6, y }, 70, 0, 8);
    await page.waitForTimeout(700);
    await expect(page.getByTestId("list-detail")).toBeVisible();
    await expect(page).toHaveURL(/list=/);
    expect(
      await page
        .locator(".sp-pushed")
        .evaluate((el) => Math.round(new DOMMatrixReadOnly(getComputedStyle(el).transform).m41)),
    ).toBe(0);

    await swipe(page, { x: 6, y }, Math.round(viewport.width * 0.6), 0, 12);
    await expect(page.getByTestId("list-detail")).toHaveCount(0, { timeout: 4000 });
    await expect(page).not.toHaveURL(/list=/);
    await expect(page.getByTestId("list-card")).toHaveCount(1);
    // Back popped the entry that opening the list pushed: forward returns to the list.
    await page.goForward();
    await expect(page.getByTestId("list-detail")).toBeVisible();
  });

  test("a sheet follows the finger: scrolls inside first, then drags, and dismisses with a pull", async ({
    page,
    browserName,
  }, info) => {
    test.skip(!isPhone(info.project.name) || browserName !== "chromium", "needs real touch input");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto("/routines");
    await page.getByRole("button", { name: /Manage routines/ }).click();
    await page.getByRole("button", { name: "Add routine" }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await page.waitForTimeout(600);
    const box = (await sheet.boundingBox())!;
    const mid = { x: box.x + box.width / 2, y: box.y + box.height * 0.55 };
    const translateY = () =>
      sheet.evaluate((el) => Math.round(new DOMMatrixReadOnly(getComputedStyle(el).transform).m42));

    // Push up inside the content: it scrolls, the sheet stays.
    await swipe(page, mid, 0, -220, 10);
    await page.waitForTimeout(300);
    expect(await translateY()).toBe(0);
    const scrolled = await sheet.evaluate(
      (el) => el.querySelector(".overflow-y-auto")?.scrollTop ?? 0,
    );
    expect(scrolled).toBeGreaterThan(40);

    // Pull down while the content is scrolled: it scrolls back, the sheet still stays open.
    await swipe(page, mid, 0, 120, 8);
    await page.waitForTimeout(300);
    await expect(sheet).toBeVisible();

    // Content at the top: a pull drags the sheet (to its medium detent first, for a tall sheet).
    await sheet.evaluate((el) => el.querySelector(".overflow-y-auto")?.scrollTo(0, 0));
    await swipe(page, mid, 0, 150, 10, { stepDelay: 24 });
    await page.waitForTimeout(700);
    await expect(sheet).toBeVisible();
    expect(await translateY()).toBeGreaterThan(100);

    // A long pull from there dismisses it.
    const now = (await sheet.boundingBox())!;
    await swipe(page, { x: now.x + now.width / 2, y: now.y + 60 }, 0, 420, 8);
    await expect(sheet).toHaveCount(0, { timeout: 4000 });
  });

  test("dragging a list puts the keyboard away", async ({ page, browserName }, info) => {
    test.skip(!isPhone(info.project.name) || browserName !== "chromium", "needs real touch input");
    await seedTasks(30);
    await page.goto("/tasks?tab=all");
    await page.getByRole("radio", { name: "All", exact: true }).click();
    const name = page.getByLabel("Task name");
    await name.tap();
    await expect(name).toBeFocused();
    const viewport = page.viewportSize()!;
    await swipe(page, { x: viewport.width / 2, y: viewport.height * 0.7 }, 0, -160, 8);
    await expect(name).not.toBeFocused();
  });

  test("the universe holds its frame while the page is being scrolled", async ({ page }) => {
    await seedTasks(40);
    await page.goto("/tasks?tab=all");
    await page.getByRole("radio", { name: "All", exact: true }).click();
    await expect(page.getByTestId("all-tab")).toContainText("Task 40");
    const yielding = () =>
      page.evaluate(() =>
        (
          window as unknown as { __stellarUniverse: { yielding: () => number } }
        ).__stellarUniverse.yielding(),
      );
    await page.waitForTimeout(700);
    expect(await yielding()).toBe(0);
    await page.evaluate(() => window.scrollBy(0, 300));
    await expect.poll(yielding, { intervals: [10] }).toBeGreaterThan(0);
    await expect.poll(yielding, { timeout: 3000 }).toBe(0);
  });

  test("the installed app reopens where it was left, with the unsent draft", async ({
    page,
    context,
  }, info) => {
    test.skip(!isPhone(info.project.name), "home screen app");
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "standalone", { value: true, configurable: true });
    });
    await seedTasks(45);
    await page.goto("/tasks?tab=all");
    await page.getByRole("radio", { name: "All", exact: true }).click();
    await expect(page.getByTestId("all-tab")).toContainText("Task 45");
    await page.getByLabel("Task name").fill("Half-typed thought");
    await page.evaluate(() => window.scrollTo(0, 520));
    // The app goes to the background; iOS later ends it.
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await page.close();

    const relaunched = await context.newPage();
    await relaunched.goto("/");
    await expect(relaunched).toHaveURL(/\/tasks\?tab=all/);
    await expect(relaunched.getByTestId("all-tab")).toContainText("Task 45");
    await expect(relaunched.getByLabel("Task name")).toHaveValue("Half-typed thought");
    await expect.poll(() => relaunched.evaluate(() => Math.round(window.scrollY))).toBe(520);

    // In an ordinary browser tab the address is the truth: nothing is restored.
    await relaunched.evaluate(() => {
      Object.defineProperty(navigator, "standalone", { value: false, configurable: true });
    });
  });
});
