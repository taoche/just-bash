---
"just-bash": patch
---

Prevent defense-in-depth violation reporting from recursively overflowing the call stack in host runtimes that wrap `Date.now()`, and honor configured main-thread violation exclusions.
