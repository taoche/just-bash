import { describe, expect, it } from "vitest";
import type {
  ArithCommandSubstNode,
  ArithmeticExpansionPart,
  SimpleCommandNode,
} from "../ast/types.js";
import { Parser } from "./parser.js";

const parseCommandSubstitution = (script: string): ArithCommandSubstNode => {
  const command = new Parser().parse(script).statements[0].pipelines[0]
    .commands[0] as SimpleCommandNode;
  const expansion = command.args[0].parts[0] as ArithmeticExpansionPart;
  if (expansion.type !== "ArithmeticExpansion") {
    throw new Error("expected arithmetic expansion");
  }
  const expression = expansion.expression.expression;
  if (expression.type !== "ArithBinary") {
    throw new Error("expected binary arithmetic expression");
  }
  if (expression.left.type !== "ArithCommandSubst") {
    throw new Error("expected arithmetic command substitution");
  }
  return expression.left;
};

describe("arithmetic command substitution parser", () => {
  it("keeps dollar-paren source text and parses its body", () => {
    const substitution = parseCommandSubstitution(
      'echo $(( $(printf "1 + 2") * 3 ))',
    );

    expect(substitution.command).toBe('printf "1 + 2"');
    expect(substitution.body?.statements).toHaveLength(1);
  });

  it("keeps backtick source text and parses its body", () => {
    const substitution = parseCommandSubstitution(
      'echo $(( `printf "1 + 2"` * 3 ))',
    );

    expect(substitution.command).toBe('printf "1 + 2"');
    expect(substitution.body?.statements).toHaveLength(1);
  });

  it("uses command substitution boundaries inside quoted command arguments", () => {
    const substitution = parseCommandSubstitution(
      'echo $(( $(printf ")" >&2; printf 1) + 1 ))',
    );

    expect(substitution.command).toBe('printf ")" >&2; printf 1');
    expect(substitution.body?.statements).toHaveLength(2);
  });
});
