import { afterEach, beforeEach, describe, it } from "vitest";
import {
  cleanupTestDir,
  compareOutputs,
  createTestDir,
  setupFiles,
} from "./fixture-runner.js";

describe("arithmetic command substitution - Real Bash Comparison", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  it("preserves arithmetic expansion and current-shell substitution semantics", async () => {
    const env = await setupFiles(testDir, {});
    await compareOutputs(
      env,
      testDir,
      [
        "number=4",
        "add() { printf '%s' \"$number + 2\"; }",
        "echo $(( $(add) * 3 ))",
        "echo $(( `printf '1 + 2'` * 3 ))",
        'echo $(( $(printf ")" >&2; printf 1) + 1 ))',
        "mkdir nested",
        "cd nested",
        "echo $(( $(pwd | grep -c '/nested') ))",
        "number=5",
        "echo $(( $(number=9; printf 1) + number ))",
        'echo "$number"',
        "rm -f marker",
        "echo $(( 0 && $(echo touched > marker; printf 1) ))",
        "if [ -f marker ]; then echo present; else echo absent; fi",
        "(( $(printf '2 + 1') * 2 ))",
        'echo "$?"',
        'for ((i=$(printf 0); i < $(printf 2); i += $(printf 1))); do echo "$i"; done',
        "value=abcd",
        "echo \"${value:$(printf '1 + 1'):1}\"",
      ].join("\n"),
    );
  });
});
