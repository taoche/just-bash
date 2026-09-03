---
"just-bash": minor
---

Make the regex engine behind `UserRegex` pluggable

Every user-provided pattern (grep, sed, awk, jq, `[[ =~ ]]`, …) is compiled and
matched through a `RegexEngine`. re2js remains the default and the only engine
shipped, so nothing changes for existing users. A Node host can install another
linear-time engine — e.g. a native RE2 binding — with `setRegexEngine(engine)`;
`getRegexEngine()` and `re2jsEngine` are exported alongside it, together with the
`RegexEngine`, `CompiledRegex`, `RegexMatcher`, `RegexEngineFlags` types and the
`RegexSyntaxError` an engine throws for unsupported or invalid patterns.

The engine must guarantee linear-time matching for every pattern it accepts;
`UserRegex`'s ReDoS protection is exactly that property, and `THREAT_MODEL.md`
now says so.
