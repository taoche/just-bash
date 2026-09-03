/**
 * Pluggable engine behind UserRegex.
 *
 * Every user-provided pattern (grep, sed, awk, jq, `[[ =~ ]]`, …) is compiled
 * and matched through one engine. The default is re2js, a pure-JS RE2 port,
 * which runs everywhere just-bash runs. A host may install another engine —
 * e.g. a native RE2 binding on Node — to trade portability for speed.
 *
 * Security contract for any installed engine: matching must be linear in the
 * input length for every pattern the engine accepts. UserRegex's ReDoS
 * protection is exactly this property; an engine that backtracks removes it.
 */

export interface RegexEngineFlags {
  ignoreCase: boolean;
  multiline: boolean;
  dotAll: boolean;
}

/**
 * Cursor over one input string. Modelled on RE2JS's Matcher so the default
 * adapter is a thin wrapper and the higher-level operations in UserRegex stay
 * engine-agnostic.
 */
export interface RegexMatcher {
  /** Search from `start` (default 0). On success, start/end/group describe the match. */
  find(start?: number): boolean;
  start(group?: number): number;
  end(group?: number): number;
  /** Text of a capture group; null when the group did not participate. */
  group(index?: number): string | null;
  /** Point at a new input and rewind, reusing this matcher's allocations. */
  reset(input: string): void;
}

export interface CompiledRegex {
  groupCount(): number;
  /** Capture group name → index. Empty when the pattern has no named groups. */
  namedGroups(): Record<string, number>;
  matcher(input: string): RegexMatcher;
}

export interface RegexEngine {
  /**
   * `pattern` is in JavaScript RegExp syntax. Throws RegexSyntaxError when the
   * pattern is invalid or uses a feature the engine does not support.
   */
  compile(pattern: string, flags: RegexEngineFlags): CompiledRegex;
}

export class RegexSyntaxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegexSyntaxError";
  }
}
