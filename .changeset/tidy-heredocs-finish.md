---
"just-bash": patch
---

Preserve whether a here-document ended at its delimiter or at end-of-input. Unterminated final body lines now receive Bash's trailing newline, and serializing their AST no longer manufactures a closing delimiter.
