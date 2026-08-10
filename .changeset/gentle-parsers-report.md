---
"just-bash": minor
---

Export `BashParseError` as the common base class for lexer and parser failures thrown by `parse()`, allowing parser consumers to distinguish invalid Bash input from unrelated errors without relying on internal modules or error names.
