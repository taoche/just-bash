// Default engine: re2js, a pure-JS port of RE2.

import { RE2JS, RE2JSSyntaxException } from "re2js";
import {
  type CompiledRegex,
  type RegexEngine,
  type RegexEngineFlags,
  type RegexMatcher,
  RegexSyntaxError,
} from "./engine.js";

type Re2jsMatcher = ReturnType<RE2JS["matcher"]>;

function convertFlags(flags: RegexEngineFlags): number {
  let re2Flags = 0;
  if (flags.ignoreCase) {
    re2Flags |= RE2JS.CASE_INSENSITIVE;
  }
  if (flags.multiline) {
    re2Flags |= RE2JS.MULTILINE;
  }
  if (flags.dotAll) {
    re2Flags |= RE2JS.DOTALL;
  }
  return re2Flags;
}

class Re2jsMatcherAdapter implements RegexMatcher {
  constructor(private readonly matcher: Re2jsMatcher) {}

  find(start?: number): boolean {
    return this.matcher.find(start);
  }

  start(group?: number): number {
    return this.matcher.start(group);
  }

  end(group?: number): number {
    return this.matcher.end(group);
  }

  group(index?: number): string | null {
    return this.matcher.group(index);
  }

  reset(input: string): void {
    // Swap the cached Utf16MatcherInput's charSequence in-place to avoid
    // allocating a new Matcher per call. RE2JS's resetMatcherInput is not
    // safe with raw strings (the constructor wraps strings via
    // MatcherInput.utf16, but resetMatcherInput assigns its argument
    // directly and then calls .length() as a method, which throws on a
    // raw string). MatcherInput is not exported, so we mutate the existing
    // wrapper's charSequence field — Matcher.reset() reads matcherInput.length()
    // afterwards, so the new length is picked up correctly.
    // biome-ignore lint/suspicious/noExplicitAny: reaching into re2js internals
    (this.matcher as any).matcherInput.charSequence = input;
    this.matcher.reset();
  }
}

class Re2jsCompiledRegex implements CompiledRegex {
  constructor(private readonly re2: RE2JS) {}

  groupCount(): number {
    return this.re2.groupCount();
  }

  namedGroups(): Record<string, number> {
    return this.re2.namedGroups();
  }

  matcher(input: string): RegexMatcher {
    return new Re2jsMatcherAdapter(this.re2.matcher(input));
  }
}

export const re2jsEngine: RegexEngine = {
  compile(pattern, flags) {
    try {
      return new Re2jsCompiledRegex(
        RE2JS.compile(RE2JS.translateRegExp(pattern), convertFlags(flags)),
      );
    } catch (e) {
      if (e instanceof RE2JSSyntaxException) {
        throw new RegexSyntaxError(e.message || "");
      }
      throw e;
    }
  },
};
