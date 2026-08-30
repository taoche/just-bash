import { afterEach, describe, expect, it } from "vitest";
import { Bash } from "../../Bash.js";
import { DefenseInDepthBox } from "../../security/defense-in-depth-box.js";
import { InMemoryFs } from "./in-memory-fs.js";

describe("lazy provider under defense-in-depth (#253)", () => {
  afterEach(() => DefenseInDepthBox.resetInstance());

  it("materializes a provider that settles on a macrotask during exec", async () => {
    const bash = new Bash({
      defenseInDepth: true,
      files: {
        "/async.md": async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return "ASYNC_RESOLVED";
        },
      },
    });

    const result = await bash.exec("cat /async.md");

    expect(result.stderr).toBe("");
    expect(result.stdout).toBe("ASYNC_RESOLVED");
    expect(result.exitCode).toBe(0);
  });

  it("materializes a provider that reads process.env during exec", async () => {
    process.env.JUST_BASH_LAZY_TEST = "FROM_ENV";
    try {
      const bash = new Bash({
        defenseInDepth: true,
        files: {
          "/env.md": async () => {
            await new Promise((resolve) => setTimeout(resolve, 0));
            return process.env.JUST_BASH_LAZY_TEST ?? "";
          },
        },
      });

      const result = await bash.exec("cat /env.md");

      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("FROM_ENV");
    } finally {
      delete process.env.JUST_BASH_LAZY_TEST;
    }
  });

  it("does not leave the trusted scope active after materialization", async () => {
    const fs = new InMemoryFs();
    fs.writeFileLazy("/late.md", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return "LATE";
    });
    const bash = new Bash({ defenseInDepth: true, fs });

    const first = await bash.exec("cat /late.md");
    expect(first.stdout).toBe("LATE");

    const box = DefenseInDepthBox.getInstance(true);
    expect(box.getStats().refCount).toBe(0);
  });
});
