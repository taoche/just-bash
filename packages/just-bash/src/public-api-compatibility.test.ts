import { describe, expect, it } from "vitest";
import {
  BashParseError,
  type Command,
  type CommandContext,
  createCommandContext,
  EMPTY_BYTES,
  InMemoryFs,
  parse,
} from "./index.js";

describe("public API source compatibility", () => {
  it("keeps standalone inputs separate from resolved command callbacks", async () => {
    const context: CommandContext = {
      fs: new InMemoryFs(),
      cwd: "/",
      env: new Map(),
      stdin: EMPTY_BYTES,
    };
    const command: Command = {
      name: "legacy",
      async execute(_args, ctx) {
        return {
          stdout: `${ctx.cwd}:${ctx.limits.maxOutputSize}`,
          stderr: "",
          exitCode: 0,
        };
      },
    };
    const dispatched = createCommandContext({ fs: context.fs });

    expect(await command.execute([], dispatched)).toEqual({
      stdout: `/:${dispatched.limits.maxOutputSize}`,
      stderr: "",
      exitCode: 0,
    });
    expect("limits" in context).toBe(false);
    expect(dispatched.limits.maxOutputSize).toBeGreaterThan(0);
  });

  it("exports one base class for parser and lexer failures", () => {
    expect(() => parse("fi")).toThrow(BashParseError);
    expect(() => parse('echo "unterminated')).toThrow(BashParseError);
  });
});
