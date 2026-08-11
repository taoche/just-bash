import { describe, expect, it } from "vitest";
import {
  cleanupTestDir,
  createTestDir,
  runRealBash,
  setupFiles,
} from "../../comparison-tests/fixture-runner.js";

const quoteForShell = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;

describe("structured extglob expansion", () => {
  const compareWithBash = async (
    files: Record<string, string>,
    script: string,
    options: string[] = [],
  ): Promise<void> => {
    const testDirectory = await createTestDir();
    try {
      const bash = await setupFiles(testDirectory, files);
      const expected = await runRealBash(
        `bash -O extglob${options.map((option) => ` -O ${option}`).join("")} -c ${quoteForShell(script)}`,
        testDirectory,
      );
      const actual = await bash.exec(
        `shopt -s extglob${options.length > 0 ? ` ${options.join(" ")}` : ""}\n${script}`,
        { rawScript: true },
      );

      expect({
        stdout: actual.stdout,
        stderr: actual.stderr,
        exitCode: actual.exitCode,
      }).toEqual(expected);
    } finally {
      await cleanupTestDir(testDirectory);
    }
  };

  it("matches @(), ?(), *(), and +() like Bash", async () => {
    await compareWithBash(
      {
        x: "",
        xbar: "",
        xbaz: "",
        xfoo: "",
        xfoofoo: "",
      },
      "printf '@\\n'; printf '<%s>\\n' x@(foo|bar); printf '?\\n'; printf '<%s>\\n' x?(foo|bar); printf '*\\n'; printf '<%s>\\n' x*(foo|bar); printf '+\\n'; printf '<%s>\\n' x+(foo|bar)",
    );
  });

  it("keeps the existing !() no-match fallback", async () => {
    await compareWithBash({}, "printf '<%s>\\n' x!(foo|bar)");
  });

  it("matches nested, quoted, and escaped alternatives", async () => {
    await compareWithBash(
      {
        xbar: "",
        xbaz: "",
        xescaped: "",
        "xescaped|pipe": "",
        xfoo: "",
        "xquoted)close": "",
        "xquoted|pipe": "",
      },
      "printf '<%s>\\n' x@(foo|@(bar|baz)|'quoted|pipe'|escaped\\|pipe|\"quoted)close\")",
    );
  });

  it("executes dollar and backtick substitutions inside alternatives", async () => {
    await compareWithBash(
      { "x)": "", xfoo: "" },
      "printf '<%s>\\n' x@($(printf ')')|foo); printf '<%s>\\n' x@(`printf ')'`|foo)",
    );
  });

  it("expands no-match alternatives before preserving the default pattern", async () => {
    await compareWithBash({}, "printf '<%s>\\n' x@($(printf missing)|foo)");
  });

  it("runs substitutions while set -f disables pathname expansion", async () => {
    await compareWithBash(
      { xmissing: "" },
      "set -f; printf '<%s>\\n' x@($(printf missing)|foo)",
    );
  });

  it("preserves substitution stderr once before failglob", async () => {
    await compareWithBash(
      {},
      "printf '<%s>\\n' x@($(printf 'expanded\\n' >&2; printf missing))",
      ["failglob"],
    );
  });
});
