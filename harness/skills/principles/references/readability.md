## Code readability

Code is read more often than it is written: it must be clear on first reading, extend without rework, and look tidy. The established rules of the project's language come first — its style guide, formatter, and linters; the rules below are on top of them, where the language does not decide by itself.

- An intermediate result gets a name. A call argument holds no more than one nested call: instead of `toSet(filter(map(list)))` — variables named after the steps. A long chain of transformations is split into steps with meaning.
- A condition with meaning gets a name: `isExpired`, not a long expression inside an `if`. Conditional expressions are not nested in each other.
- A blank line separates blocks of meaning: early exits from the main path, preparation from the action, a multiline block from its neighbors. Dense text without blank lines and blank lines inside a single thought hurt reading equally.
- Nesting is no deeper than two levels. Deeper — an early exit or a separate function.
- A function holds one level of abstraction: it either names the steps or does the work by hand.
- A flag does not switch a function's behavior: two behaviors, two functions. Many parameters — one object with named fields.
- Input is not changed: a function returns a new value. A variable is immutable by default.
- Names without negations (`isValid`, not `isNotInvalid`); boolean names are a question with a yes-or-no answer: `is`, `has`, `can`.
