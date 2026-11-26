// Annotates the pull request with the tests that failed for good. Playwright's own "github"
// reporter also annotates every attempt that failed before a retry passed, which puts a
// "Check failure" comment on a pull request whose checks are all green.
import path from "node:path";
import type { Reporter, Suite, TestCase } from "@playwright/test/reporter";

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;

/** Escaping for workflow commands: the message, and the stricter form for property values. */
const data = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const property = (s: string) => data(s).replace(/:/g, "%3A").replace(/,/g, "%2C");

export default class GithubFailures implements Reporter {
  private suite: Suite | undefined;

  onBegin(_config: unknown, suite: Suite) {
    this.suite = suite;
  }

  onEnd() {
    const root = process.env.GITHUB_WORKSPACE ?? process.cwd();
    for (const test of this.suite?.allTests() ?? []) {
      // "flaky" passed on its retry: the job is green, so it gets no annotation.
      if (test.outcome() !== "unexpected") continue;
      process.stdout.write(`${annotation(test, root)}\n`);
    }
  }

  printsToStdio() {
    return true;
  }
}

function annotation(test: TestCase, root: string): string {
  const error = test.results.at(-1)?.error;
  const at = error?.location ?? test.location;
  const title = test.titlePath().filter(Boolean).join(" › ");
  const message = (error?.message ?? error?.value ?? "Test failed").replace(ANSI, "");
  const file = path.relative(root, at.file);
  return `::error file=${property(file)},line=${at.line},col=${at.column},title=${property(title)}::${data(message)}`;
}
