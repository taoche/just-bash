import { describe, expect, it } from "vitest";
import { Bash } from "../Bash.js";

describe("escaped words", () => {
  it("treats an escaped ordinary regex character literally", async () => {
    const result = await new Bash().exec("[[ q =~ \\q ]]");

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("treats an escaped ordinary character in a regex bracket expression literally", async () => {
    const result = await new Bash().exec("[[ q =~ [\\q] ]]");

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("preserves escaped alias arguments while re-parsing", async () => {
    const result = await new Bash().exec(`
      shopt -s expand_aliases
      alias a='echo'
      a \\time
    `);

    expect(result.stdout).toBe("time\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("preserves escaped words in function descriptions", async () => {
    const result = await new Bash().exec(`
      function f { echo \\time; }
      type f
    `);

    expect(result.stdout).toBe(
      "f is a function\nf () \n{ \n    echo \\time\n}\n",
    );
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("quote-removes escaped array subscripts", async () => {
    const result = await new Bash().exec(
      'q=1; a[\\q]=x; printf "%s:%s" "${a[\\q]}" "${a[q]}"',
    );

    expect(result.stdout).toBe("x:x");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("does not over-escape literals in function descriptions", async () => {
    const result = await new Bash().exec(
      "function f { echo foo#bar mid!word pre~post; }; type f",
    );

    expect(result.stdout).toBe(
      "f is a function\nf () \n{ \n    echo foo#bar mid!word pre~post\n}\n",
    );
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });
});
