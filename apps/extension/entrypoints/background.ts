import { defineBackground } from "wxt/utils/define-background";
import { startBackground } from "../lib/background.ts";

// Chrome runs this as an MV3 service worker, Firefox as an event page. Both are
// suspended when idle, so nothing here relies on staying in memory: state lives
// in storage, and alarms plus startup events bring it back in sync.
export default defineBackground({
  type: "module",
  main() {
    startBackground();
  },
});
