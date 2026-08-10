import { afterEach, beforeEach, describe, it } from "vitest";
import {
  cleanupTestDir,
  compareOutputs,
  createTestDir,
  setupFiles,
} from "./fixture-runner.js";

describe("Process Substitution Parser - GNU Bash Comparison", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await createTestDir();
  });

  afterEach(async () => {
    await cleanupTestDir(testDir);
  });

  it("parses an arithmetic command at the start of the body", async () => {
    const env = await setupFiles(testDir, {});
    await compareOutputs(env, testDir, "echo 2<(((1)))");
  });

  it("preserves conditional word context", async () => {
    const env = await setupFiles(testDir, {});
    await compareOutputs(
      env,
      testDir,
      "[[ <(true){a,b} == '/dev/fd/63{a,b}' ]] && echo conditional-ok",
    );
  });

  it("preserves regex word context", async () => {
    const env = await setupFiles(testDir, {});
    await compareOutputs(
      env,
      testDir,
      "[[ /dev/fd/63+ =~ <(true)\\+ ]] && echo regex-ok",
    );
  });

  it("keeps process-like heredoc delimiters literal", async () => {
    const env = await setupFiles(testDir, {});
    await compareOutputs(
      env,
      testDir,
      "cat <<EOF<(echo hi)\nheredoc-ok\nEOF<(echo hi)",
    );
  });

  it("preserves assignment expansion after a substitution", async () => {
    const env = await setupFiles(testDir, {});
    await compareOutputs(
      env,
      testDir,
      'HOME=/tmp/home; x=<(true):~; echo "$x"',
    );
  });

  it("keeps assignment-shaped suffixes in their shell word", async () => {
    const env = await setupFiles(testDir, {});
    await compareOutputs(
      env,
      testDir,
      'printf "<%s>\\n" <(true)x=y; x=<(true)y=z; printf "<%s>\\n" "$x"',
    );
  });

  it("keeps grammar-shaped prefixes in their shell word", async () => {
    const env = await setupFiles(testDir, {});
    await compareOutputs(
      env,
      testDir,
      'printf "<%s>\\n" }<(true) ]]<(true) {fd}>(true)',
    );
  });

  it("keeps reserved and pipeline prefixes in their shell word", async () => {
    const env = await setupFiles(testDir, {});
    await compareOutputs(
      env,
      testDir,
      "!<(true); time<(true); do<(true); fi<(true); else<(true)",
    );
  });

  for (const operator of ["&", "&&", "||"]) {
    it(`rejects ${operator} before a process substitution`, async () => {
      const env = await setupFiles(testDir, {});
      await compareOutputs(env, testDir, `${operator}<(true); echo survived`);
    });
  }

  for (const spacing of [" ", ""]) {
    it(`recognizes a comment after a heredoc operator with ${spacing ? "space" : "no space"}`, async () => {
      const env = await setupFiles(testDir, {});
      await compareOutputs(
        env,
        testDir,
        `cat <<${spacing}#comment\necho survived\n`,
      );
    });
  }

  it("tracks nested process-body line numbers", async () => {
    const env = await setupFiles(testDir, {});
    await compareOutputs(
      env,
      testDir,
      "true\ncat <(\necho outer=$LINENO\ncat <(echo inner=$LINENO)\n)",
    );
  });
});
