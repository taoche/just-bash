import { afterEach, describe, expect, it } from "vitest";
import {
  type CompiledRegex,
  type RegexEngine,
  type RegexEngineFlags,
  type RegexMatcher,
  RegexSyntaxError,
} from "./engine.js";
import { re2jsEngine } from "./re2js-engine.js";
import {
  createUserRegex,
  getRegexEngine,
  setRegexEngine,
} from "./user-regex.js";

// Test-only reference adapter over the host RegExp. It exists to prove the
// RegexMatcher/CompiledRegex surface is sufficient for every UserRegex
// operation; it is deliberately not exported, since it backtracks.
class HostRegExpMatcher implements RegexMatcher {
  private match: RegExpExecArray | null = null;

  constructor(
    private readonly regex: RegExp,
    private input: string,
  ) {}

  find(start = 0): boolean {
    if (start > this.input.length) {
      this.match = null;
      return false;
    }
    this.regex.lastIndex = start;
    this.match = this.regex.exec(this.input);
    return this.match !== null;
  }

  start(group = 0): number {
    return this.indices()[group]?.[0] ?? -1;
  }

  end(group = 0): number {
    return this.indices()[group]?.[1] ?? -1;
  }

  group(index = 0): string | null {
    return this.match?.[index] ?? null;
  }

  reset(input: string): void {
    this.input = input;
    this.match = null;
  }

  private indices(): Array<[number, number] | undefined> {
    const indices = (
      this.match as
        | (RegExpExecArray & { indices?: Array<[number, number]> })
        | null
    )?.indices;
    return indices ?? [];
  }
}

const hostRegExpEngine: RegexEngine = {
  compile(pattern: string, flags: RegexEngineFlags): CompiledRegex {
    let regex: RegExp;
    try {
      regex = new RegExp(
        pattern,
        `gd${flags.ignoreCase ? "i" : ""}${flags.multiline ? "m" : ""}${flags.dotAll ? "s" : ""}`,
      );
    } catch (e) {
      throw new RegexSyntaxError((e as Error).message);
    }
    const groupCount = (new RegExp(`${pattern}|`).exec("")?.length ?? 1) - 1;
    const names = [...pattern.matchAll(/\(\?<([A-Za-z_$][\w$]*)>/g)].map(
      (m) => m[1],
    );
    const namedGroups: Record<string, number> = {};
    // Named groups are numbered in order of their opening parenthesis; this
    // reference adapter only supports patterns whose groups are all named or
    // all unnamed, which is what the tests below use.
    names.forEach((name, i) => {
      namedGroups[name as string] = i + 1;
    });
    return {
      groupCount: () => groupCount,
      namedGroups: () => namedGroups,
      matcher: (input) => new HostRegExpMatcher(regex, input),
    };
  },
};

describe("regex engine seam", () => {
  afterEach(() => {
    setRegexEngine(re2jsEngine);
  });

  it("defaults to re2js and returns the previous engine on install", () => {
    expect(getRegexEngine()).toBe(re2jsEngine);
    const previous = setRegexEngine(hostRegExpEngine);
    expect(previous).toBe(re2jsEngine);
    expect(getRegexEngine()).toBe(hostRegExpEngine);
  });

  it("routes compilation and flags through the installed engine", () => {
    const seen: Array<{ pattern: string; flags: RegexEngineFlags }> = [];
    setRegexEngine({
      compile(pattern, flags) {
        seen.push({ pattern, flags });
        return re2jsEngine.compile(pattern, flags);
      },
    });

    const regex = createUserRegex("a.b", "gims");
    expect(regex.test("A\nB")).toBe(true);
    expect(seen).toEqual([
      {
        pattern: "a.b",
        flags: { ignoreCase: true, multiline: true, dotAll: true },
      },
    ]);
  });

  it("wraps the engine's RegexSyntaxError in the standard invalid-pattern message", () => {
    setRegexEngine({
      compile() {
        throw new RegexSyntaxError("engine says no");
      },
    });
    expect(() => createUserRegex("x")).toThrow(
      /^Invalid regular expression: \/x\/: engine says no/,
    );
  });

  it("still explains unsupported lookahead when a custom engine rejects it", () => {
    setRegexEngine({
      compile() {
        throw new RegexSyntaxError("unsupported");
      },
    });
    expect(() => createUserRegex("(?=x)")).toThrow(/Lookahead/);
  });

  it("lets other engine errors propagate untouched", () => {
    setRegexEngine({
      compile() {
        throw new TypeError("engine crashed");
      },
    });
    expect(() => createUserRegex("x")).toThrow(TypeError);
  });

  describe("every UserRegex operation works against a non-default engine", () => {
    it("test, exec, search", () => {
      setRegexEngine(hostRegExpEngine);
      const regex = createUserRegex("(\\d+)-(\\d+)", "i");
      expect(regex.test("id 12-34")).toBe(true);
      const match = regex.exec("id 12-34");
      expect(match && [...match]).toEqual(["12-34", "12", "34"]);
      expect(match?.index).toBe(3);
      expect(regex.search("id 12-34")).toBe(3);
      expect(regex.search("nothing")).toBe(-1);
    });

    it("global match, replace with $n, callback replace, split, matchAll", () => {
      setRegexEngine(hostRegExpEngine);
      const global = createUserRegex("(\\d)", "g");
      expect(global.match("a1b2c3")).toEqual(["1", "2", "3"]);
      expect(global.replace("a1b2c3", "[$1]")).toBe("a[1]b[2]c[3]");
      expect(global.replace("a1b2c3", (m) => `<${m}>`)).toBe("a<1>b<2>c<3>");
      expect(global.split("a1b2c3")).toEqual(["a", "b", "c", ""]);
      expect([...global.matchAll("a1b2")].map((m) => [m[0], m.index])).toEqual([
        ["1", 1],
        ["2", 3],
      ]);
    });

    it("named groups and zero-length matches", () => {
      setRegexEngine(hostRegExpEngine);
      const named = createUserRegex("(?<year>\\d{4})-(?<month>\\d{2})");
      expect(named.exec("on 2026-09")?.groups).toEqual({
        year: "2026",
        month: "09",
      });

      const empty = createUserRegex("x*", "g");
      expect(empty.replace("abc", "-")).toBe("-a-b-c-");
      expect(empty.match("abc")).toEqual(["", "", "", ""]);
    });

    it("lastIndex advances with exec on a global pattern", () => {
      setRegexEngine(hostRegExpEngine);
      const regex = createUserRegex("a", "g");
      expect(regex.exec("aXa")?.index).toBe(0);
      expect(regex.lastIndex).toBe(1);
      expect(regex.exec("aXa")?.index).toBe(2);
      expect(regex.exec("aXa")).toBeNull();
      expect(regex.lastIndex).toBe(0);
    });

    it("reuses one matcher across inputs through reset", () => {
      setRegexEngine(hostRegExpEngine);
      const regex = createUserRegex("b");
      expect(regex.test("abc")).toBe(true);
      expect(regex.test("xyz")).toBe(false);
      expect(regex.search("aab")).toBe(2);
    });
  });
});
