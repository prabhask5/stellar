import {
  clearLockout,
  enterPin,
  uniqueIp,
  ensureConfigured,
  expect,
  insetsFor,
  isPhone,
  PIN,
  resetInstance,
  signIn,
  SUPABASE_URL,
  sql,
  test,
} from "./support/helpers";

test.describe("PIN login", () => {
  test.beforeAll(async ({ request }) => {
    await resetInstance();
    await ensureConfigured(request);
  });
  test.beforeEach(() => clearLockout());

  test("signed-out visitors land on the lock screen and can unlock", async ({
    page,
    shot,
  }, info) => {
    await page.goto("/tasks");
    await expect(page).toHaveURL(/\/lock\?next=%2Ftasks$/);
    await expect(page.getByRole("heading", { name: "Enter your PIN" })).toBeVisible();
    await shot("lock");

    // Nothing is inside the top inset (notch / Dynamic Island) or under the home indicator.
    const box = await page.getByText("Stellar Planner", { exact: true }).boundingBox();
    const insets = await page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement);
      return {
        top: parseFloat(cs.getPropertyValue("--sat")) || 0,
        bottom: parseFloat(cs.getPropertyValue("--sab")) || 0,
      };
    });
    if (insetsFor(info.project.name) === "island") expect(insets.top).toBe(59);
    expect(box!.y).toBeGreaterThanOrEqual(insets.top);
    const unlock = await page.getByRole("button", { name: "Unlock" }).boundingBox();
    const viewport = page.viewportSize()!;
    expect(unlock!.y + unlock!.height).toBeLessThanOrEqual(viewport.height - insets.bottom);

    await enterPin(page, "000000", info.project.name);
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByText("That PIN didn't work. Try again.")).toBeVisible();

    await enterPin(page, PIN, info.project.name);
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page).toHaveURL(/\/tasks$/);

    // The length is remembered on this device, so next time the PIN submits itself.
    expect(await page.evaluate(() => localStorage.getItem("sp-pin-length"))).toBe("6");
    // Leave the app before signing the browser out. An open page notices the missing session
    // and goes to the PIN screen by itself (with ?next=/tasks), racing the navigation below.
    await page.goto("about:blank");
    await page.context().clearCookies();
    await page.goto("/");
    await expect(page).toHaveURL(/\/lock$/);
    await enterPin(page, PIN, info.project.name);
    await expect(page).toHaveURL(/\/$/);
  });

  test("five wrong PINs lock sign-in for 30 seconds, then it doubles", async ({
    page,
    request,
    shot,
  }, info) => {
    await page.goto("/lock");
    for (let i = 0; i < 4; i++) {
      await enterPin(page, "111111", info.project.name);
      await page.getByRole("button", { name: "Unlock" }).click();
      await expect(page.getByText("That PIN didn't work. Try again.")).toBeVisible();
      if (!isPhone(info.project.name)) await page.keyboard.press("Escape");
    }
    await enterPin(page, "111111", info.project.name);
    await page.getByRole("button", { name: "Unlock" }).click();
    await expect(page.getByText(/Too many attempts\. Try again in 0:(30|29|28)\./)).toBeVisible();
    await expect(page.getByRole("button", { name: "Unlock" })).toBeDisabled();
    await shot("lock-locked-out");

    // Even the right PIN is refused while locked, with a generic message and Retry-After.
    const blocked = await request.post("/api/v1/auth/pin", {
      data: { pin: PIN, device: { name: "x", kind: "extension" } },
    });
    expect(blocked.status()).toBe(423);
    expect(Number(blocked.headers()["retry-after"])).toBeGreaterThan(20);
    const body = await blocked.json();
    expect(body.error.code).toBe("locked");
    expect(JSON.stringify(body)).not.toContain("session");

    // The counter is persisted in /data, so a restart would not reset it.
    const { readFileSync } = await import("node:fs");
    const { DATA_DIR } = await import("./support/helpers");
    const state = JSON.parse(readFileSync(`${DATA_DIR}/lockout.json`, "utf8"));
    expect(state.failures).toBe(5);
    expect(state.lockedUntil).toBeGreaterThan(Date.now());

    const kinds = (
      await sql<{ kind: string }>("select kind from sp_auth_events order by created_at")
    ).map((r) => r.kind);
    expect(kinds.filter((k) => k === "pin_failure").length).toBeGreaterThanOrEqual(5);
    expect(kinds).toContain("pin_locked");
  });

  test("extension and iOS clients receive tokens; web clients do not", async ({
    request,
    playwright,
    baseURL,
  }) => {
    const ext = await request.post("/api/v1/auth/pin", {
      data: { pin: PIN, device: { name: "Chrome extension", kind: "extension" } },
    });
    expect(ext.ok()).toBe(true);
    const extBody = await ext.json();
    expect(extBody.session.access_token).toBeTruthy();
    expect(extBody.session.refresh_token).toBeTruthy();
    expect(extBody.session.expires_at).toBeGreaterThan(Date.now() / 1000);

    const web = await request.post("/api/v1/auth/pin", {
      data: { pin: PIN, device: { name: "Browser", kind: "web" } },
    });
    const webBody = await web.json();
    expect(webBody).toMatchObject({ ok: true });
    expect(webBody.session).toBeUndefined();
    expect(web.headers()["set-cookie"]).toMatch(/sp-auth[^;]*=.*HttpOnly/i);

    // Bearer tokens work against the API from a context with no cookies at all.
    const bare = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { "x-forwarded-for": uniqueIp() },
    });
    const headers = { Authorization: `Bearer ${extBody.session.access_token}` };
    const devices = await (await bare.get("/api/v1/devices", { headers })).json();
    expect(devices.data.map((d: { kind: string }) => d.kind)).toEqual(
      expect.arrayContaining(["extension", "web"]),
    );
    expect(devices.data.find((d: { current: boolean }) => d.current)?.kind).toBe("extension");
    expect(devices.can_revoke).toBe(true);

    const refreshed = await bare.post("/api/v1/auth/refresh", {
      data: { refresh_token: extBody.session.refresh_token },
    });
    expect(refreshed.ok()).toBe(true);
    const fresh = (await refreshed.json()).session;
    expect(fresh.access_token).toBeTruthy();

    expect((await bare.get("/api/v1/devices")).status()).toBe(401);
    expect(
      (
        await bare.get("/api/v1/devices", { headers: { Authorization: "Bearer nonsense" } })
      ).status(),
    ).toBe(401);
    expect(
      (await bare.post("/api/v1/auth/refresh", { data: { refresh_token: "nope" } })).status(),
    ).toBe(401);

    // Revoking a device deletes its auth session: its tokens stop refreshing.
    const target = devices.data.find((d: { kind: string }) => d.kind === "extension");
    const auth = { Authorization: `Bearer ${fresh.access_token}` };
    expect((await bare.delete(`/api/v1/devices/${target.id}`, { headers: auth })).ok()).toBe(true);
    expect(
      (
        await bare.post("/api/v1/auth/refresh", { data: { refresh_token: fresh.refresh_token } })
      ).status(),
    ).toBe(401);
    await bare.dispose();
  });

  test("change PIN, sign out everywhere", async ({ browser, baseURL }) => {
    const a = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "x-forwarded-for": uniqueIp() },
    });
    const b = await browser.newContext({
      baseURL,
      extraHTTPHeaders: { "x-forwarded-for": uniqueIp() },
    });
    await signIn(a);
    await signIn(b);
    expect((await a.request.get("/api/v1/auth/session")).ok()).toBe(true);

    const wrong = await a.request.post("/api/v1/auth/pin/change", {
      data: { current_pin: "000000", new_pin: "135790" },
    });
    expect(wrong.status()).toBe(401);
    const weak = await a.request.post("/api/v1/auth/pin/change", {
      data: { current_pin: PIN, new_pin: "123" },
    });
    expect(weak.status()).toBe(400);
    expect(
      (
        await a.request.post("/api/v1/auth/pin/change", {
          data: { current_pin: PIN, new_pin: "135790" },
        })
      ).ok(),
    ).toBe(true);
    expect(
      (
        await b.request.post("/api/v1/auth/pin", {
          data: { pin: PIN, device: { name: "x", kind: "web" } },
        })
      ).status(),
    ).toBe(401);
    clearLockout();
    expect(
      (
        await a.request.post("/api/v1/auth/pin/change", {
          data: { current_pin: "135790", new_pin: PIN },
        })
      ).ok(),
    ).toBe(true);

    // The web session endpoint hands out a short-lived access token, never the refresh token.
    const session = await (await a.request.get("/api/v1/auth/session")).json();
    expect(session.access_token).toBeTruthy();
    expect(session.refresh_token).toBeUndefined();
    expect(session.supabase_url).toBe(SUPABASE_URL);

    expect((await a.request.post("/api/v1/auth/logout-everywhere")).ok()).toBe(true);
    expect((await a.request.get("/api/v1/auth/session")).status()).toBe(401);
    expect((await b.request.get("/api/v1/auth/session")).status()).toBe(401);
    const pageB = await b.newPage();
    await pageB.goto("/");
    await expect(pageB.getByRole("heading", { name: "Enter your PIN" })).toBeVisible();

    // The PIN still works afterwards (the hidden password was rotated server-side).
    await signIn(a);
    expect((await a.request.get("/api/v1/auth/session")).ok()).toBe(true);
    await a.close();
    await b.close();
  });
});
