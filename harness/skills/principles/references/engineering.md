## Engineering principles

- Code reads as a description of what it does: names from the project's domain, without `data`, `item`, `handle`, `process`, and without abbreviations other than the common ones.
- One function, one action. If a function cannot be named without "and", it must be split. The body reads top to bottom: early exits first, then the main path.
- Errors are not swallowed: they are handled or returned with context.
- No magic values: numbers and strings with a meaning get a name.
- A comment explains "why" when it is not visible from the code. Retelling the code, commented-out code, and dead code are not allowed.
- New logic comes with a test next to it. A test checks behavior, not the structure of the code.
