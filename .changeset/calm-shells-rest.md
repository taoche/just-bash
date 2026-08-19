---
"just-bash": patch
---

Prevent defense-in-depth violation reporting from recursively overflowing the call stack in host runtimes that wrap `Date.now()`, honor configured main-thread violation exclusions, and include actionable exclusion guidance for configurable violations.
