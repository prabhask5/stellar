import { describe, expect, it } from "vitest";
import { describeTest, type TestPushResult } from "./push";

const base: TestPushResult = {
  sent: 0,
  failed: 0,
  removed: 0,
  subscriptions: 0,
  configured: true,
  errors: [],
};

describe("describeTest", () => {
  it("says so when every device got it", () => {
    expect(describeTest({ ...base, sent: 2, subscriptions: 2 })).toEqual({
      ok: true,
      message: "Test sent to 2 devices",
    });
  });

  it("never reports success when nothing was delivered", () => {
    expect(describeTest({ ...base, configured: false }).ok).toBe(false);
    expect(describeTest(base)).toEqual({
      ok: false,
      message: "No device is registered. Turn notifications off and on again.",
    });
  });

  it("names the push service and its answer when a device is refused", () => {
    const r = describeTest({
      ...base,
      subscriptions: 1,
      failed: 1,
      errors: [{ service: "web.push.apple.com", status: 403, message: "BadJwtToken" }],
    });
    expect(r.ok).toBe(false);
    expect(r.message).toContain("refused by web.push.apple.com (403)");
  });

  it("reports a mix as partly delivered", () => {
    const r = describeTest({
      ...base,
      subscriptions: 3,
      sent: 1,
      removed: 1,
      failed: 1,
      errors: [],
    });
    expect(r.ok).toBe(true);
    expect(r.message).toMatch(/^Sent to 1 device\. 1 device no longer subscribed/);
  });
});
