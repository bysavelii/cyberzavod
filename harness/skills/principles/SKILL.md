---
name: principles
description: The engineering principles of the project — architecture, change scope, engineering, code readability, safety. Use before writing, changing or reviewing code.
metadata:
  always-on: safety
---

The principles every stage of the work follows, one file each. Read the ones that bear on the work at hand, and all of them before writing or reviewing code.

- [Architecture](references/architecture.md) — dependencies point inward, extension by adding, abstraction on the second real case, one source of truth.
- [Change scope](references/change-scope.md) — only what the task is about, no keeping the old for its own sake, small cohesive commits.
- [Engineering principles](references/engineering.md) — domain names, one function one action, errors with context, no magic values, tests for new logic.
- [Code readability](references/readability.md) — named intermediate results and conditions, blank lines between blocks, shallow nesting, no flag arguments.
- [Safety](references/safety.md) — no secrets in the code or the journal, no bypassed checks, nothing irreversible without consent.
