import { describe, expect, it } from "vitest";
import { Bash } from "../../Bash.js";
import {
  cleanupTestDir,
  createTestDir,
  runRealBash,
  setupFiles,
} from "../../comparison-tests/fixture-runner.js";
import { ExecutionLimitError } from "../errors.js";

const quoteForShell = (value: string): string =>
  `'${value.replaceAll("'", "'\\''")}'`;

describe("structured extglob expansion", () => {
  const compareWithBash = async (
    files: Record<string, string>,
    script: string,
    options: string[] = [],
    expectedJustBashStderr?: string,
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

      expect({ stdout: actual.stdout, exitCode: actual.exitCode }).toEqual({
        stdout: expected.stdout,
        exitCode: expected.exitCode,
      });
      expect(actual.stderr).toBe(expectedJustBashStderr ?? expected.stderr);
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

  it("preserves expansion-produced backslashes in redirects", async () => {
    await compareWithBash(
      {},
      "set -f; value='\\\\*'; printf hi > @($value); test -f '@(\\*)'",
    );
  });

  it("keeps quoted alternatives literal before pathname expansion", async () => {
    await compareWithBash(
      { xfoo: "", xstar: "" },
      "value=foo; printf '<%s>\\n' x@('*'|$value)",
    );
  });

  it("splits unquoted values before expanding the extglob", async () => {
    await compareWithBash(
      { "bar.cc": "", "bar.h": "" },
      "value='a b'; printf '<%s>\\n' $value*.@(cc|h)",
    );
  });

  it("rejects split structured redirects before honoring set -f", async () => {
    // Bash adds a version-dependent source-line prefix to this diagnostic.
    await compareWithBash(
      {},
      "value='a b'; set -f; printf hi > @($value)",
      [],
      "bash: @($value): ambiguous redirect\n",
    );
  });

  it("preserves substitution stderr once before failglob", async () => {
    // Bash adds a version-dependent source-line prefix to this diagnostic.
    await compareWithBash(
      {},
      "printf '<%s>\\n' x@($(printf 'expanded\\n' >&2; printf missing))",
      ["failglob"],
      "expanded\nbash: no match: x@(missing)\n",
    );
  });

  it("forwards substitution stderr from case patterns", async () => {
    await compareWithBash(
      {},
      "case foo in @($(printf 'err\\n' >&2; printf foo)|bar) ) printf matched;; esac",
    );
  });

  it("enforces maxStringLength after rebuilding structured extglobs", async () => {
    const bash = new Bash({ executionLimits: { maxStringLength: 7 } });
    const result = await bash.exec("shopt -s extglob; : @($(printf 123456))");

    expect(result.exitCode).toBe(ExecutionLimitError.EXIT_CODE);
    expect(result.stderr).toBe(
      "bash: word expansion: string length limit exceeded (7 bytes)\n",
    );
  });

  it("keeps quoted extglob alternatives intact during word splitting", async () => {
    await compareWithBash(
      {},
      "v='a b'; set -f; printf '<%s>\\n' @($v|\"d e\")",
    );
  });

  it("preserves leading IFS breaks after extglob syntax", async () => {
    await compareWithBash({}, "v=' a '; set -f; printf '<%s>\\n' @($v|q)");
  });

  it("evaluates structured extglob alternatives once while globbing is disabled", async () => {
    await compareWithBash({}, 'i=0; set -f; : @($((i++))); echo "$i"');
  });

  it("evaluates structured extglob substitutions once with an empty IFS", async () => {
    await compareWithBash(
      {},
      "rm -f marker; IFS=; : @($(echo x >> marker; printf x)); cat marker",
    );
  });

  it("does not double-account case-pattern substitution stderr", async () => {
    const bash = new Bash({ executionLimits: { maxOutputSize: 4 } });
    const result = await bash.exec(
      "shopt -s extglob; case x in @($(printf 1234 >&2; printf x))) :;; esac",
    );

    expect(result).toMatchObject({ stdout: "", stderr: "1234", exitCode: 0 });
  });

  it("does not charge captured substitution output against the parent", async () => {
    const bash = new Bash({ executionLimits: { maxOutputSize: 4 } });
    const result = await bash.exec(
      "shopt -s extglob; : @($(printf 1234 >&2; printf x))",
    );

    expect(result).toMatchObject({ stdout: "", stderr: "1234", exitCode: 0 });
  });

  it("does not charge captured compound stdout against visible stderr", async () => {
    const bash = new Bash({ executionLimits: { maxOutputSize: 4 } });
    const result = await bash.exec(
      "x=$(if true; then printf x; printf 1234 >&2; fi)",
    );

    expect(result).toMatchObject({ stdout: "", stderr: "1234", exitCode: 0 });
  });

  it("does not leak captured stdout from a failed substitution", async () => {
    const bash = new Bash({
      executionLimits: { maxOutputSize: 4, maxLoopIterations: 1 },
    });
    const result = await bash.exec(
      "printf abc; x=$(printf def; while true; do :; done)",
    );

    expect(result.stdout).toBe("abc");
    expect(result.exitCode).toBe(ExecutionLimitError.EXIT_CODE);
    expect(result.stderr).toContain("while loop: too many iterations");
  });

  it("does not re-evaluate parameters while splitting structured alternatives", async () => {
    await compareWithBash(
      {},
      'i=0; unset values; set -f; printf "<%s>\\n" @(${values[i++]:-"q"x}); echo "i=$i"',
    );
  });

  it("retains the complete redirect source in ambiguous redirect errors", async () => {
    const bash = new Bash();
    const result = await bash.exec("value='a b'; set -f; printf hi > $value*");

    expect(result).toMatchObject({
      stdout: "",
      stderr: "bash: $value*: ambiguous redirect\n",
      exitCode: 1,
    });
  });
});
