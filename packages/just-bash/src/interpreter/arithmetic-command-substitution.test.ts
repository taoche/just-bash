import { describe, expect, it } from "vitest";
import { Bash } from "../Bash.js";

describe("arithmetic command substitution", () => {
  it("evaluates output as arithmetic text in the current shell", async () => {
    const bash = new Bash();

    const result = await bash.exec(`
      number=4
      add() { printf '%s' "$number + 2"; }
      echo $(( $(add) * 3 ))
      echo $(( \`printf '1 + 2'\` * 3 ))
      mkdir nested
      cd nested
      echo $(( $(pwd | grep -c '/nested') ))
      number=5
      echo $(( $(number=9; printf 1) + number ))
      echo "$number"
      rm -f marker
      echo $(( 0 && $(echo touched > marker; printf 1) ))
      if [ -f marker ]; then echo present; else echo absent; fi
      (( $(printf '2 + 1') * 2 ))
      echo "$?"
      for ((i=$(printf 0); i < $(printf 2); i += $(printf 1))); do echo "$i"; done
      value=abcd
      echo "\${value:$(printf '1 + 1'):1}"
    `);

    expect(result.stdout).toBe("10\n7\n1\n6\n5\n0\npresent\n0\n0\n1\nc\n");
    expect(result.stderr).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("preserves quoted command arguments while finding substitution boundaries", async () => {
    const bash = new Bash();

    const result = await bash.exec(
      'echo $(( $(printf ")" >&2; printf 1) + 1 ))',
    );

    expect(result.stdout).toBe("2\n");
    expect(result.stderr).toBe(")");
    expect(result.exitCode).toBe(0);
  });

  it("does not re-evaluate shell syntax from substitution output", async () => {
    const bash = new Bash();

    const result = await bash.exec(`
      generated() { echo generated >&2; }
      echo $(( $(printf '1 + $(generated)') ))
    `);

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "bash: syntax error in arithmetic command substitution\n",
    );
    expect(result.exitCode).toBe(1);
  });

  it("does not treat generated quotes as arithmetic expansion syntax", async () => {
    const bash = new Bash();

    const result = await bash.exec(`
      echo $(( $(printf '"1 + 2"') * 3 ))
    `);

    expect(result.stdout).toBe("");
    expect(result.stderr).toBe(
      "bash: syntax error in arithmetic command substitution\n",
    );
    expect(result.exitCode).toBe(1);
  });
});
