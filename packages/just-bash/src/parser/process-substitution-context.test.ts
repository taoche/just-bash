import { describe, expect, it } from "vitest";
import type {
  ConditionalCommandNode,
  ProcessSubstitutionPart,
  SimpleCommandNode,
  WordPart,
} from "../ast/types.js";
import { Lexer, TokenType } from "./lexer.js";
import { Parser } from "./parser.js";

const asSimpleCommand = (script: string): SimpleCommandNode =>
  new Parser().parse(script).statements[0].pipelines[0]
    .commands[0] as SimpleCommandNode;

const asProcessSubstitution = (part: WordPart): ProcessSubstitutionPart => {
  expect(part.type).toBe("ProcessSubstitution");
  return part as ProcessSubstitutionPart;
};

describe("process substitution parser contexts", () => {
  it("preserves the outer parenthesis before an arithmetic command", () => {
    const tokens = new Lexer("echo 2<(((1)))").tokenize();
    expect(tokens.map((token) => token.type)).toEqual([
      TokenType.NAME,
      TokenType.NUMBER,
      TokenType.LESS,
      TokenType.LPAREN,
      TokenType.DPAREN_START,
      TokenType.NUMBER,
      TokenType.DPAREN_END,
      TokenType.RPAREN,
      TokenType.EOF,
    ]);

    const parts = asSimpleCommand("echo 2<(((1)))").args[0].parts;
    expect(parts[0]).toEqual({ type: "Literal", value: "2" });
    const processSubstitution = asProcessSubstitution(parts[1]);
    expect(
      processSubstitution.body.statements[0].pipelines[0].commands[0].type,
    ).toBe("ArithmeticCommand");
  });

  it("preserves no-brace-expansion context on adjacent atoms", () => {
    const command = new Parser().parse(
      "[[ <(true){a,b} == '/dev/fd/63{a,b}' ]]",
    ).statements[0].pipelines[0].commands[0] as ConditionalCommandNode;
    expect(command.expression.type).toBe("CondBinary");
    if (command.expression.type !== "CondBinary") {
      throw new Error("expected a binary conditional");
    }
    expect(command.expression.left.parts).toHaveLength(2);
    asProcessSubstitution(command.expression.left.parts[0]);
    expect(command.expression.left.parts[1]).toEqual({
      type: "Literal",
      value: "{a,b}",
    });
  });

  it("preserves regex context on adjacent atoms", () => {
    const command = new Parser().parse("[[ /dev/fd/63+ =~ <(true)\\+ ]]")
      .statements[0].pipelines[0].commands[0] as ConditionalCommandNode;
    expect(command.expression.type).toBe("CondBinary");
    if (command.expression.type !== "CondBinary") {
      throw new Error("expected a binary conditional");
    }
    expect(command.expression.right.parts).toHaveLength(2);
    asProcessSubstitution(command.expression.right.parts[0]);
    expect(command.expression.right.parts[1]).toEqual({
      type: "Escaped",
      value: "+",
    });
  });

  it("keeps process-like heredoc delimiters literal", () => {
    const script = "cat <<EOF<(echo hi)\nbody\nEOF<(echo hi)\n";
    const tokens = new Lexer(script).tokenize();
    expect(tokens.map((token) => token.type)).toEqual([
      TokenType.NAME,
      TokenType.DLESS,
      TokenType.WORD,
      TokenType.NEWLINE,
      TokenType.HEREDOC_CONTENT,
      TokenType.EOF,
    ]);

    const command = asSimpleCommand(script);
    expect(command.args).toHaveLength(0);
    expect(command.redirections[0].target).toMatchObject({
      type: "HereDoc",
      delimiter: "EOF<(echo hi)",
    });
  });

  it("preserves non-special backslashes in double-quoted heredoc delimiters", () => {
    const command = asSimpleCommand('cat <<"E\\OF"\nbody\nE\\OF\n');
    expect(command.redirections[0].target).toMatchObject({
      type: "HereDoc",
      delimiter: "E\\OF",
    });
  });

  it("keeps command substitution syntax literal in heredoc delimiters", () => {
    const command = asSimpleCommand("cat <<EOF$(echo x)\nbody\nEOF$(echo x)\n");
    expect(command.redirections[0].target).toMatchObject({
      type: "HereDoc",
      delimiter: "EOF$(echo x)",
    });
  });

  it("preserves assignment expansion on adjacent suffixes", () => {
    const command = asSimpleCommand("x=<(true):~");
    const value = command.assignments[0].value;
    if (!value) throw new Error("expected an assignment value");
    expect(value.parts).toHaveLength(3);
    asProcessSubstitution(value.parts[0]);
    expect(value.parts[1]).toEqual({ type: "Literal", value: ":" });
    expect(value.parts[2]).toEqual({ type: "TildeExpansion", user: null });
  });

  it("owns LINENO relative to each process body", () => {
    const ast = new Parser().parse(`true
cat <(

echo outer=$LINENO

echo second=$LINENO
cat <(
echo inner=$LINENO
)
)`);
    const outerCommand = ast.statements[1].pipelines[0]
      .commands[0] as SimpleCommandNode;
    const outerProcess = asProcessSubstitution(outerCommand.args[0].parts[0]);
    const outerEcho = outerProcess.body.statements[0].pipelines[0]
      .commands[0] as SimpleCommandNode;
    const secondEcho = outerProcess.body.statements[1].pipelines[0]
      .commands[0] as SimpleCommandNode;
    const nestedCat = outerProcess.body.statements[2].pipelines[0]
      .commands[0] as SimpleCommandNode;
    const innerProcess = asProcessSubstitution(nestedCat.args[0].parts[0]);
    const innerEcho = innerProcess.body.statements[0].pipelines[0]
      .commands[0] as SimpleCommandNode;
    expect(outerEcho.line).toBe(2);
    expect(secondEcho.line).toBe(3);
    expect(innerEcho.line).toBe(4);
  });
});
