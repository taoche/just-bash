import { describe, expect, it } from "vitest";
import { Bash } from "../Bash.js";

describe("bare fd-variable redirections", () => {
  it("creates the target but unsets and closes the allocated descriptor", async () => {
    const env = new Bash();
    const result = await env.exec(
      '{output}>/tmp/out; printf "[%s]" "$output"; printf closed >&10; printf ":%s" "$?"',
    );

    expect(result.stdout).toBe("[]:1");
    expect(result.stderr).toBe("bash: 10: Bad file descriptor\n");
    expect(result.exitCode).toBe(0);
    expect(await env.readFile("/tmp/out")).toBe("");
  });

  it("makes fd 10 reusable by the next named allocation", async () => {
    const env = new Bash();
    const result = await env.exec(
      '{bare}>/tmp/bare; : {named}>/tmp/named; printf "%s" "$named"',
    );

    expect(result.stdout).toBe("10");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("scopes a bare fd-variable heredoc descriptor", async () => {
    const env = new Bash();
    const result = await env.exec(
      '{input}<<EOF 3<&$input\nvalue\nEOF\nprintf "input=[%s] status=%s\\n" "$input" "$?"',
    );

    expect(result.stdout).toBe("input=[] status=0\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });
});
