import { describe, expect, it } from "vitest";
import { Bash } from "../Bash.js";

describe("fd-variable redirections", () => {
  describe("compound command owners", () => {
    const currentShellCases = [
      {
        name: "group",
        script: '{ printf group >&$output; } {output}>/tmp/out; printf "set"',
        content: "group",
      },
      {
        name: "if",
        script:
          'if true; then printf if >&$output; fi {output}>/tmp/out; printf "set"',
        content: "if",
      },
      {
        name: "for",
        script:
          'for value in one; do printf for >&$output; done {output}>/tmp/out; printf "set"',
        content: "for",
      },
      {
        name: "C-style for",
        script:
          'for ((i=0; i<1; i++)); do printf cfor >&$output; done {output}>/tmp/out; printf "set"',
        content: "cfor",
      },
      {
        name: "while",
        script:
          'while true; do printf while >&$output; break; done {output}>/tmp/out; printf "set"',
        content: "while",
      },
      {
        name: "until",
        script:
          'until false; do printf until >&$output; break; done {output}>/tmp/out; printf "set"',
        content: "until",
      },
      {
        name: "case",
        script:
          'case value in value) printf case >&$output;; esac {output}>/tmp/out; printf "set"',
        content: "case",
      },
      {
        name: "arithmetic command",
        script:
          '(( 1 )) {output}>/tmp/out; printf arithmetic >&$output; printf "set"',
        content: "arithmetic",
      },
      {
        name: "conditional command",
        script:
          '[[ -n value ]] {output}>/tmp/out; printf conditional >&$output; printf "set"',
        content: "conditional",
      },
      {
        name: "function definition",
        script:
          'fn() { printf function >&$output; } {output}>/tmp/out; fn; printf "set"',
        content: "function",
      },
    ] as const;

    for (const testCase of currentShellCases) {
      it(`allocates for a ${testCase.name} in the current shell`, async () => {
        const env = new Bash();
        const result = await env.exec(testCase.script);

        expect(result.stdout).toBe("set");
        expect(result.stderr).toBe("");
        expect(result.exitCode).toBe(0);
        expect(await env.readFile("/tmp/out")).toBe(testCase.content);
      });
    }

    it("isolates a subshell allocation from its parent", async () => {
      const env = new Bash();
      const result = await env.exec(
        '( printf subshell >&$output ) {output}>/tmp/out; printf "parent:[%s]" "$output"',
      );

      expect(result.stdout).toBe("parent:[]");
      expect(result.stderr).toBe("");
      expect(result.exitCode).toBe(0);
      expect(await env.readFile("/tmp/out")).toBe("subshell");
    });
  });

  it("preserves earlier output effects before a readonly failure", async () => {
    const env = new Bash({
      env: { output: "9" },
      files: { "/tmp/first": "first\n", "/tmp/second": "second\n" },
    });
    await env.exec("readonly output");
    const result = await env.exec(": > /tmp/first {output}>|/tmp/second");

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toContain("readonly variable");
    expect(await env.readFile("/tmp/first")).toBe("");
    expect(await env.readFile("/tmp/second")).toBe("second\n");
  });

  it("keeps an earlier allocation after a later redirect fails", async () => {
    const env = new Bash();
    const result = await env.exec(
      ': {output}>/tmp/out < /tmp/missing; status=$?; printf kept >&$output; printf "status:%s" "$status"',
    );

    expect(result.stdout).toBe("status:1");
    expect(result.stderr).toContain("No such file or directory");
    expect(result.exitCode).toBe(0);
    expect(await env.readFile("/tmp/out")).toBe("kept");
  });

  it("does not reopen an ordinary output redirect under noclobber", async () => {
    const env = new Bash();
    const result = await env.exec(
      'set -C; : > /tmp/new; printf "status:%s" "$?"',
    );

    expect(result.stdout).toBe("status:0");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(await env.readFile("/tmp/new")).toBe("");
  });

  it("checks descriptor capacity before truncating an fd-variable target", async () => {
    const env = new Bash({
      executionLimits: { maxFileDescriptors: 1 },
      files: { "/tmp/existing": "preserve\n" },
    });
    const result = await env.exec("exec 3>/tmp/held; {output}>|/tmp/existing");

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "bash: too many open file descriptors (max 1)\n",
    );
    expect(result.exitCode).toBe(126);
    expect(await env.readFile("/tmp/existing")).toBe("preserve\n");

    const state = await env.exec(
      ': {next}>/tmp/next; printf "[%s]:%s" "$output" "$next"',
    );
    expect(state.stdout).toBe("[]:10");
    expect(state.stderr).toBe("");
    expect(state.exitCode).toBe(0);
  });

  it("duplicates live stdout into an allocated descriptor", async () => {
    const env = new Bash();
    const result = await env.exec(": {copy}>&1; printf live >&$copy");

    expect(result.stdout).toBe("live");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("shares a user descriptor's read position", async () => {
    const env = new Bash();
    const result = await env.exec(
      "printf 'a\\nb\\n' > /tmp/input; exec 4< /tmp/input; : {copy}<&4; read -u 4 first; read -u $copy second; printf '%s:%s' \"$first\" \"$second\"",
    );

    expect(result.stdout).toBe("a:b");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("rejects duplication from a closed descriptor without allocating", async () => {
    const env = new Bash();
    const result = await env.exec("{copy}>&9");

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("bash: 9: Bad file descriptor\n");
    expect(result.exitCode).toBe(1);

    const state = await env.exec(
      ': {next}>/tmp/next; printf "[%s]:%s" "$copy" "$next"',
    );
    expect(state.stdout).toBe("[]:10");
    expect(state.stderr).toBe("");
    expect(state.exitCode).toBe(0);
  });

  it("does not prepare redirects when argument globbing throws", async () => {
    const env = new Bash();
    const result = await env.exec(
      'shopt -s failglob; : missing-* {output}>/tmp/out 3>/tmp/numeric; printf "output=[%s] " "$output"; printf leak >&3; printf "fd=%s" "$?"',
    );

    expect(result.stdout).toBe("output=[] fd=1");
    expect(result.stderr).toContain("no match");
    expect(result.stderr).toContain("3: Bad file descriptor");
    await expect(env.readFile("/tmp/out")).rejects.toThrow();
    await expect(env.readFile("/tmp/numeric")).rejects.toThrow();
  });

  it("routes ExitError output through compound redirects", async () => {
    const env = new Bash();
    const result = await env.exec(
      "{ printf before; printf problem >&2; exit 7; } >/tmp/out 2>/tmp/err",
    );

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(7);
    expect(await env.readFile("/tmp/out")).toBe("before");
    expect(await env.readFile("/tmp/err")).toBe("problem");
  });

  it("routes ReturnError output through function-definition redirects", async () => {
    const env = new Bash();
    const result = await env.exec(
      "fn() { printf before; printf problem >&2; return 4; } >/tmp/out 2>/tmp/err; fn; printf ':%s' \"$?\"",
    );

    expect(result.stdout).toBe(":4");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(await env.readFile("/tmp/out")).toBe("before");
    expect(await env.readFile("/tmp/err")).toBe("problem");
  });

  it("routes Errexit output through compound redirects", async () => {
    const env = new Bash();
    const result = await env.exec(
      "set -e; { printf before; printf problem >&2; false; printf never; } >/tmp/out 2>/tmp/err",
    );

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(1);
    expect(await env.readFile("/tmp/out")).toBe("before");
    expect(await env.readFile("/tmp/err")).toBe("problem");
  });

  it("routes loop control output before preserving the control flow", async () => {
    const env = new Bash();
    const result = await env.exec(
      "while true; do { printf before; break; } >/tmp/out; printf never; done; printf after",
    );

    expect(result.stdout).toBe("after");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(await env.readFile("/tmp/out")).toBe("before");
  });

  it("routes continue output before preserving the control flow", async () => {
    const env = new Bash();
    const result = await env.exec(
      'for value in one two; do { printf "$value"; continue; } >>/tmp/out; printf never; done; printf after',
    );

    expect(result.stdout).toBe("after");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(await env.readFile("/tmp/out")).toBe("onetwo");
  });

  it("snapshots a standard source sink at its list position", async () => {
    const env = new Bash();
    const result = await env.exec("printf snapshot 3>&1 1>/tmp/later >&3");

    expect(result.stdout).toBe("snapshot");
    expect(result.stderr).toBe("");
    expect(await env.readFile("/tmp/later")).toBe("");
  });

  it("commits exec routes that precede a later redirect failure", async () => {
    const env = new Bash();
    const result = await env.exec("exec >/tmp/out </tmp/missing; printf after");

    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("No such file or directory");
    expect(result.exitCode).toBe(0);
    expect(await env.readFile("/tmp/out")).toBe("after");
  });

  it("allocates a readable descriptor for an fd-variable heredoc", async () => {
    const env = new Bash();
    const result = await env.exec(
      ": {input}<<EOF\nvalue\nEOF\nread -u $input line; printf '%s' \"$line\"",
    );

    expect(result.stdout).toBe("value");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("allows a capacity-neutral fd-variable move", async () => {
    const env = new Bash({ executionLimits: { maxFileDescriptors: 1 } });
    const result = await env.exec(
      "exec 3>/tmp/out; exec {moved}>&3-; printf moved >&$moved",
    );

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
    expect(await env.readFile("/tmp/out")).toBe("moved");
  });

  it("validates a move source before reporting descriptor capacity", async () => {
    const env = new Bash({ executionLimits: { maxFileDescriptors: 1 } });
    const result = await env.exec("exec 3>/tmp/out; exec {moved}>&9-");

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("bash: 9: Bad file descriptor\n");
    expect(result.exitCode).toBe(1);
  });

  it("shares a readwrite position across aliases and writes", async () => {
    const env = new Bash();
    const result = await env.exec(
      'printf abc >/tmp/file; exec 3<>/tmp/file; exec 4<&3; read -u 3 -n 1 first; printf X >&4; read -u 3 -n 1 second; printf \'%s:%s:\' "$first" "$second"; cat /tmp/file',
    );

    expect(result.stdout).toBe("a:c:aXc");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });
});
