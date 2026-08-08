import { describe, expect, it } from "vitest";
import { Bash } from "../Bash.js";
import { parse } from "../parser/parser.js";

const commandLeadingContexts = [
  {
    name: "at top level",
    script: (word: string) => `${word}; echo trailing-payload`,
    line: 1,
    column: 1,
  },
  {
    name: "after a pipe",
    script: (word: string) => `echo input | ${word}; echo trailing-payload`,
    line: 1,
    column: 14,
  },
  {
    name: "after pipeline negation",
    script: (word: string) => `! ${word}; echo trailing-payload`,
    line: 1,
    column: 3,
  },
  {
    name: "inside a group",
    script: (word: string) => `{ ${word}; echo trailing-payload; }`,
    line: 1,
    column: 3,
  },
  {
    name: "inside command substitution",
    script: (word: string) => `echo "$(${word}; echo trailing-payload)"`,
    line: 1,
    column: 1,
  },
];

describe("unsupported reserved words", () => {
  for (const word of ["select", "coproc", "in"]) {
    for (const context of commandLeadingContexts) {
      it(`rejects ${word} ${context.name} without executing trailing payloads`, async () => {
        const result = await new Bash().exec(context.script(word));

        expect(result.stdout).toBe("");
        expect(result.stderr).toBe(
          `bash: syntax error: Parse error at ${context.line}:${context.column}: syntax error near unexpected token \`${word}'\n`,
        );
        expect(result.exitCode).toBe(2);
      });
    }
  }

  it("rejects pipeline negation after a pipe", async () => {
    const result = await new Bash().exec(
      "echo input | ! cat; echo trailing-payload",
    );

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "bash: syntax error: Parse error at 1:14: syntax error near unexpected token `!'\n",
    );
    expect(result.exitCode).toBe(2);
  });

  it("recognizes timing after pipeline negation", () => {
    const pipeline = parse("! time true").statements[0].pipelines[0];

    expect(pipeline.negated).toBe(true);
    expect(pipeline.timed).toBe(true);
    expect(pipeline.timePosix).toBe(false);
  });

  it("recognizes alternating negation and timing prefixes", () => {
    const pipeline = parse("! time ! true").statements[0].pipelines[0];

    expect(pipeline.negated).toBe(false);
    expect(pipeline.timed).toBe(true);
    expect(pipeline.timePosix).toBe(false);
  });

  it.each([
    ["time time true", false],
    ["time -p -- true", true],
  ] as const)("recognizes timing prefixes in %s", (source, timePosix) => {
    const pipeline = parse(source).statements[0].pipelines[0];

    expect(pipeline.timed).toBe(true);
    expect(pipeline.timePosix).toBe(timePosix);
  });

  it("treats bare -- as the command after time", () => {
    const pipeline = parse("time -- select").statements[0].pipelines[0];

    expect(pipeline.timed).toBe(true);
    expect(pipeline.commands[0]).toMatchObject({
      type: "SimpleCommand",
      name: {
        parts: [{ type: "Literal", value: "--" }],
      },
      args: [
        {
          parts: [{ type: "Literal", value: "select" }],
        },
      ],
    });
  });

  it("rejects unsupported syntax after recursive timing prefixes", async () => {
    const result = await new Bash().exec(
      "! time time ! select; echo trailing-payload",
    );

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "bash: syntax error: Parse error at 1:15: syntax error near unexpected token `select'\n",
    );
    expect(result.exitCode).toBe(2);
  });

  it("preserves reserved words in argument position", async () => {
    const result = await new Bash().exec("echo select coproc");

    expect(result.stdout).toBe("select coproc\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("preserves quoted reserved words", async () => {
    const result = await new Bash().exec(`echo "select" 'coproc'`);

    expect(result.stdout).toBe("select coproc\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });
});
