import { expect, test } from "@playwright/test";

test("health endpoint answers", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.ok()).toBe(true);
  expect((await res.json()).status).toBe("ok");
});

test("first paint includes the CSS starfield", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".sp-sky")).toBeAttached();
  const bg = await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor);
  expect(bg).toBe("rgb(7, 6, 21)");
});
