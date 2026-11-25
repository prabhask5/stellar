// Loads the built Firefox package into a real Firefox (Selenium + geckodriver) and runs the
// extension flows against a local instance: connect, block during focus, block page, popup
// controls. Playwright cannot load extensions into Firefox, so this is a separate script.
//
//   node scripts/firefox-smoke.mjs [appUrl=http://127.0.0.1:3100] [pin=246810]
//
// Needs Firefox installed, the app running, and `pnpm --filter @stellar/extension zip`.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Builder, By, until } from "selenium-webdriver";
import firefox from "selenium-webdriver/firefox.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const XPI = path.resolve(here, "../.output/stellar-focus-1.0.0-firefox.zip");
const APP = process.argv[2] ?? "http://127.0.0.1:3100";
const PIN = process.argv[3] ?? "246810";
const GECKO_ID = "stellar-focus@stellar.local";
const UUID = "5e1a7000-0000-4000-8000-000000000001";
// On the seeded "Social" block list (scripts/seed-polish.mts). The request is redirected before it leaves the browser.
const SITE = "reddit.com";
if (!existsSync(XPI)) throw new Error(`Build the Firefox package first: ${XPI}`);

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
}
const failed = results.filter((r) => !r.ok);
console.info(
  `\n${results.length - failed.length}/${results.length} Firefox extension checks passed`,
);
process.exit(failed.length ? 1 : 0);
