import { describe, expect, it } from "vitest";
import type { GlobPart } from "../ast/types.js";
import { serialize } from "../transform/serialize.js";
import { parse } from "./parser.js";
import { MAX_TOKENS, ParseException } from "./types.js";

function getGlob(script: string): GlobPart {
  const command = parse(script).statements[0].pipelines[0].commands[0];
  if (command.type !== "SimpleCommand") {
    throw new Error("Expected a simple command");
  }

  const glob = command.args[0].parts.find((part) => part.type === "Glob");
  if (!glob) {
    throw new Error("Expected a glob");
  }

  return glob;
}

describe("structured extglobs", () => {
  it("retains operator and alternatives for every extglob operator", () => {
    for (const operator of ["@", "*", "+", "?", "!"] as const) {
      const glob = getGlob(`echo x${operator}(one|two)`);

      expect(glob.pattern).toBe(`${operator}(one|two)`);
      expect(glob.extglob).toEqual({
        operator,
        alternatives: [
          { type: "Word", parts: [{ type: "Literal", value: "one" }] },
          { type: "Word", parts: [{ type: "Literal", value: "two" }] },
        ],
      });
    }
  });

  it("preserves nested, quoted, escaped, and substitution alternatives", () => {
    const glob = getGlob(
      "echo x@(foo|$(from-dollar 'bar|baz')|`from-tick ')'`|\"quoted)\"|'single|pipe'|escaped\\|pipe|@(nested|alt))",
    );

    expect(glob.extglob?.operator).toBe("@");
    expect(glob.extglob?.alternatives).toHaveLength(7);
    expect(glob.extglob?.alternatives[0].parts).toEqual([
      { type: "Literal", value: "foo" },
    ]);
    expect(glob.extglob?.alternatives[1].parts[0]).toMatchObject({
      type: "CommandSubstitution",
      legacy: false,
    });
    expect(glob.extglob?.alternatives[2].parts[0]).toMatchObject({
      type: "CommandSubstitution",
      legacy: true,
    });
    expect(glob.extglob?.alternatives[3].parts).toEqual([
      {
        type: "DoubleQuoted",
        parts: [{ type: "Literal", value: "quoted)" }],
      },
    ]);
    expect(glob.extglob?.alternatives[4].parts).toEqual([
      { type: "SingleQuoted", value: "single|pipe" },
    ]);
    expect(glob.extglob?.alternatives[5].parts).toEqual([
      { type: "Literal", value: "escaped" },
      { type: "Escaped", value: "|" },
      { type: "Literal", value: "pipe" },
    ]);
    expect(glob.extglob?.alternatives[6].parts[0]).toMatchObject({
      type: "Glob",
      extglob: { operator: "@" },
    });
  });

  it("does not split pipes inside parameter, bracket, or brace syntax", () => {
    const glob = getGlob(
      "echo x@(${value:-left|right}|[a|b]|prefix{one|two,three}|final)",
    );

    expect(glob.extglob?.alternatives).toHaveLength(4);
    expect(glob.extglob?.alternatives[0].parts[0]).toMatchObject({
      type: "ParameterExpansion",
    });
    expect(glob.extglob?.alternatives[1].parts).toEqual([
      { type: "Glob", pattern: "[a|b]" },
    ]);
    expect(glob.extglob?.alternatives[2].parts).toEqual([
      { type: "Literal", value: "prefix{one|two,three}" },
    ]);
  });

  it("treats unmatched braces as literal text", () => {
    const script = "echo x@(foo{bar|baz)";

    expect(serialize(parse(script))).toBe(script);
  });

  it("keeps an unmatched extglob brace out of a following suffix", () => {
    const script = "echo @(foo{bar)}";
    const glob = getGlob(script);

    expect(glob.pattern).toBe("@(foo{bar)");
    expect(glob.extglob?.alternatives).toHaveLength(1);
  });

  it("recognizes escaped quotes in ANSI-C alternatives", () => {
    const glob = getGlob("echo x@($'foo\\'|bar'|baz)");

    expect(glob.extglob?.alternatives).toHaveLength(2);
  });

  it("limits structured alternatives before allocating their AST", () => {
    expect(() => parse(`echo @(${"|".repeat(MAX_TOKENS)})`)).toThrow(
      ParseException,
    );
  });
});
