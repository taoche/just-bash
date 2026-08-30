import { describe, expect, it } from "vitest";
import { Bash } from "../../Bash.js";

function makeRows(count: number): string {
  const rows: string[] = [];
  for (let index = 0; index < count; index++) {
    rows.push(
      JSON.stringify({ id: index, name: `name-${index}`, value: index * 3 }),
    );
  }
  return rows.join("\n");
}

const ROWS = makeRows(99000);

function bashWithDeadline(maxExecutionTimeMs: number): Bash {
  return new Bash({
    files: { "/work/rows.jsonl": ROWS },
    cwd: "/work",
    executionLimits: { maxExecutionTimeMs },
  });
}

describe("execution deadline inside data-command row loops", () => {
  it.each([
    ["grep", `grep -c 'name-1' /work/rows.jsonl`],
    ["jq", `jq -s 'map(.value) | add' /work/rows.jsonl`],
    [
      "awk",
      `awk '{ total += length($0) } END { print total }' /work/rows.jsonl`,
    ],
    ["sed", `sed 's/name/NAME/g' /work/rows.jsonl`],
  ])(
    "stops %s once the deadline passes",
    async (_name, script) => {
      const started = Date.now();
      const result = await bashWithDeadline(25).exec(script);
      const elapsed = Date.now() - started;

      expect(result.exitCode).toBe(124);
      expect(result.stderr).toContain("execution deadline");
      expect(elapsed).toBeLessThan(2000);
    },
    60000,
  );

  it.each([
    ["grep", `grep -c 'name-1' /work/rows.jsonl`],
    ["jq", `jq -s 'map(.value) | add' /work/rows.jsonl`],
    [
      "awk",
      `awk '{ total += length($0) } END { print total }' /work/rows.jsonl`,
    ],
    ["sed", `sed 's/name/NAME/g' /work/rows.jsonl`],
  ])(
    "leaves %s unaffected when the deadline is generous",
    async (_name, script) => {
      const result = await bashWithDeadline(600000).exec(script);

      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
    },
    60000,
  );
});
