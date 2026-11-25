// Loads the packaged Firefox add-on into a real Firefox (Selenium + geckodriver) and runs the
// extension flows: connect, block during focus, block page, popup controls. Playwright
// cannot load extensions into Firefox, so this is a separate script: `pnpm test:firefox`.
//
// It is self-contained: it starts the standalone build on its own port with its own data
// directory, sets the instance up, seeds it, and stops the server when done.
// Needs Firefox, the local stack (`pnpm stack:up`) and a build (`pnpm build`).
// HEADED=1 shows the browser. SMOKE_PORT changes the port (default 3101).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { Builder, By, until } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";
import { seed } from "../support/seed.ts";

const here = import.meta.dirname;
const root = path.resolve(here, "../..");
const { version } = JSON.parse(
  readFileSync(path.join(root, "apps/extension/package.json"), "utf8"),
);
const XPI = path.join(root, `apps/extension/.output/stellar-focus-${version}-firefox.zip`);
const PORT = process.env.SMOKE_PORT ?? "3101";
const APP = `http://127.0.0.1:${PORT}`;
const PIN = "246810";
const DATA_DIR = path.join(here, ".tmp/data");
const GECKO_ID = "stellar-focus@stellar.local";
const UUID = "5e1a7000-0000-4000-8000-000000000001";
// On the seeded "Social" block list (tests/support/seed.ts). The request is redirected before it leaves the browser.
const SITE = "reddit.com";
if (!existsSync(XPI)) throw new Error(`Build the Firefox package first (pnpm build): ${XPI}`);

/** Dev-only values for the local stack; E2E_STACK_ENV points at another stack's file. */
function stackEnv() {
  const file = process.env.E2E_STACK_ENV
    ? path.resolve(process.env.E2E_STACK_ENV)
    : path.join(root, "dev/supabase/dev.env");
  return Object.fromEntries(
    readFileSync(file, "utf8")
      .split("\n")
      .map((line) => /^([A-Z_]+)=(.*)$/.exec(line.trim()))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}

/** Starts the standalone build as a fresh, unconfigured instance and waits until it answers. */
async function startApp() {
  rmSync(DATA_DIR, { recursive: true, force: true });
  mkdirSync(DATA_DIR, { recursive: true });
  const child = spawn(
    process.execPath,
    [path.join(root, "tests/e2e/support/serve-standalone.mjs"), PORT],
    { stdio: ["ignore", "ignore", "inherit"], env: { ...process.env, STELLAR_DATA_DIR: DATA_DIR } },
  );
  const exited = new Promise((_, reject) =>
    child.once("exit", (code) => reject(new Error(`The app exited early (code ${code}).`))),
  );
  exited.catch(() => {});
  const ready = (async () => {
    for (let i = 0; i < 120; i++) {
      const ok = await fetch(`${APP}/api/health`)
        .then((r) => r.ok)
        .catch(() => false);
      if (ok) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`The app did not answer on ${APP} within a minute.`);
  })();
  await Promise.race([ready, exited]);
  return child;
}

/** Runs the setup wizard's steps over HTTP, then puts the owner's data in a known state. */
async function prepare() {
  const env = stackEnv();
  const post = async (url, data) => {
    const res = await fetch(`${APP}${url}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "10.77.0.1" },
      body: data ? JSON.stringify(data) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`${url} answered ${res.status}: ${text.slice(0, 300)}`);
    return text;
  };
  await post("/api/setup/connect", {
    url: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    databaseUrl: env.DATABASE_URL,
  });
  const migrated = await post("/api/setup/migrate");
  if (!migrated.includes('"type":"result","ok":true'))
    throw new Error(`Migrations failed: ${migrated.slice(-300)}`);
  await post("/api/setup/pin", { pin: PIN, confirm: PIN, device: { name: "Smoke", kind: "web" } });
  await seed({ databaseUrl: env.DATABASE_URL });
  // An idle timer and no extension device left from an earlier run.
  const db = new pg.Client({ connectionString: env.DATABASE_URL });
  await db.connect();
  try {
    await db.query(`
      update public.sp_focus_state set status = 'idle', phase = 'focus', round = 1,
        phase_started_at = null, phase_ends_at = null, paused_remaining_ms = null,
        phase_total_ms = null, session_id = null, version = version + 1
      where user_id = (select id from auth.users where email = 'owner@stellar.local')`);
    await db.query("delete from public.sp_devices where kind = 'extension'");
  } finally {
    await db.end();
  }
}

const app = await startApp();
const stopApp = () => app.kill("SIGTERM");
process.on("exit", stopApp);
try {
  await prepare();
} catch (err) {
  stopApp();
  throw err;
}

const results = [];
const step = async (name, fn) => {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.info(`ok    ${name}${detail ? `  (${detail})` : ""}`);
  } catch (err) {
    results.push({ name, ok: false, detail: String(err?.message ?? err).split("\n")[0] });
    console.info(`FAIL  ${name}: ${String(err?.message ?? err).split("\n")[0]}`);
  }
};

const options = new firefox.Options();
if (!process.env.HEADED) options.addArguments("-headless");
// Opening moz-extension:// pages needs the browser's own (chrome) context.
options.setPreference("extensions.webextensions.uuids", JSON.stringify({ [GECKO_ID]: UUID }));
options.setPreference("xpinstall.signatures.required", false);
const service = new firefox.ServiceBuilder().addArguments("--allow-system-access");
const driver = await new Builder()
  .forBrowser("firefox")
  .setFirefoxOptions(options)
  .setFirefoxService(service)
  .build();
const base = `moz-extension://${UUID}`;
/** WebDriver may not navigate to extension pages itself, so the browser loads them as the user would. */
const openExt = async (page) => {
  await driver.setContext(firefox.Context.CHROME);
  await driver.executeScript(
    `gBrowser.selectedBrowser.fixupAndLoadURIString(arguments[0], { triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal() });`,
    `${base}/${page}`,
  );
  await driver.setContext(firefox.Context.CONTENT);
  await driver.wait(async () => (await driver.getCurrentUrl()).startsWith(base), 15_000);
};
const text = async (css) => (await driver.findElement(By.css(css))).getText();
const click = async (xpath) =>
  (await driver.wait(until.elementLocated(By.xpath(xpath)), 15_000)).click();
const api = (script, ...args) => driver.executeAsyncScript(script, ...args);

try {
  await step("install temporary add-on", async () => {
    await driver.installAddon(XPI, true);
    await openExt("popup.html");
    await driver.wait(
      until.elementLocated(
        By.xpath(
          "//h1[contains(., 'Connect your planner')] | //*[contains(., 'Connect your planner')]",
        ),
      ),
      15_000,
    );
    const m = await api(
      "const done = arguments[0]; done(JSON.stringify(browser.runtime.getManifest()));",
    );
    const manifest = JSON.parse(m);
    return `MV${manifest.manifest_version}, permissions ${manifest.permissions.join(",")}`;
  });

  await step("host permission state (MV3 host permissions are optional in Firefox)", async () => {
    const granted = await api(
      "const done = arguments[0]; browser.permissions.contains({ origins: ['<all_urls>'] }).then(done);",
    );
    return `<all_urls> granted at install: ${granted}`;
  });

  await step("connect: wrong address is reported", async () => {
    const input = await driver.findElement(By.css("input"));
    await input.clear();
    await input.sendKeys("http://127.0.0.1:9");
    await click("//button[normalize-space()='Continue']");
    await driver.wait(until.elementLocated(By.css("[role='alert']")), 20_000);
    return await text("[role='alert']");
  });

  await step("connect: URL then PIN", async () => {
    const input = await driver.findElement(By.css("input"));
    await input.clear();
    await input.sendKeys(APP);
    await click("//button[normalize-space()='Continue']");
    await driver.wait(
      until.elementLocated(By.xpath("//*[@role='status'][contains(., 'Found Stellar Planner')]")),
      20_000,
    );
    for (const d of PIN) await click(`//button[normalize-space()='${d}']`);
    await click("//button[normalize-space()='Connect']");
    await driver.wait(until.elementLocated(By.css("[data-testid='clock']")), 25_000);
    await driver.wait(async () => /\d\d:\d\d/.test(await text("[data-testid='clock']")), 15_000);
    return `clock ${await text("[data-testid='clock']")}`;
  });

  await step("popup Start installs blocking rules", async () => {
    await click("//button[contains(@aria-label, 'Start') or normalize-space()='Start focus']");
    await driver.wait(async () => {
      const n = await api(
        "const done = arguments[0]; browser.declarativeNetRequest.getDynamicRules().then((r) => done(r.length));",
      );
      return n > 0;
    }, 15_000);
    const n = await api(
      "const done = arguments[0]; browser.declarativeNetRequest.getDynamicRules().then((r) => done(r.length));",
    );
    const badge = await api(
      "const done = arguments[0]; browser.action.getBadgeText({}).then(done);",
    );
    return `${n} rules, badge "${badge}"`;
  });

  await step("a blocked site redirects to the block page with a live countdown", async () => {
    await driver.switchTo().newWindow("tab");
    await driver.get(`https://www.${SITE}/r/test?x=1`).catch(() => {});
    await driver.wait(
      async () => (await driver.getCurrentUrl()).startsWith(`${base}/blocked.html`),
      15_000,
    );
    const url = await driver.getCurrentUrl();
    await driver.wait(
      until.elementLocated(By.xpath("//*[contains(., 'This orbit is closed')]")),
      10_000,
    );
    const a = await driver.findElement(By.css("body")).getText();
    await driver.sleep(2100);
    const b = await driver.findElement(By.css("body")).getText();
    const clock = (s) => /(\d\d):(\d\d)/.exec(s);
    const [ca, cb] = [clock(a), clock(b)];
    if (!ca || !cb) throw new Error("no countdown on the block page");
    const drift = Number(ca[1]) * 60 + Number(ca[2]) - (Number(cb[1]) * 60 + Number(cb[2]));
    if (drift < 1 || drift > 3) throw new Error(`countdown moved ${drift}s in 2.1s`);
    return `${url.slice(base.length, base.length + 60)}… countdown ${ca[0]} → ${cb[0]}`;
  });

  await step("ending focus lifts the block and the page offers to continue", async () => {
    const handles = await driver.getAllWindowHandles();
    await driver.switchTo().window(handles[0]);
    await openExt("popup.html");
    await click("//button[contains(@aria-label, 'End')]");
    await driver.wait(async () => {
      const n = await api(
        "const done = arguments[0]; browser.declarativeNetRequest.getDynamicRules().then((r) => done(r.length));",
      );
      return n === 0;
    }, 15_000);
    await driver.switchTo().window(handles[1]);
    await driver.wait(until.elementLocated(By.xpath("//*[contains(., 'Focus complete')]")), 15_000);
    const link = await driver.findElement(
      By.xpath("//a[contains(@href, 'reddit.com')] | //button[contains(., 'Continue')]"),
    );
    return `handoff control: ${await link.getText()}`;
  });
} finally {
  await driver.quit();
  stopApp();
}
const failed = results.filter((r) => !r.ok);
console.info(
  `\n${results.length - failed.length}/${results.length} Firefox extension checks passed`,
);
process.exit(failed.length ? 1 : 0);
