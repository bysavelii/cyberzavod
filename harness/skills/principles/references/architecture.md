## Architecture

- Dependencies point inward: domain logic knows nothing about the framework, the database, the network, or the interface — only about its own types and interfaces.
- Extend by adding, not by editing across the whole project: a new variant is a new member of a type or a new implementation of an interface, branching on a variant is exhaustive, so that a missed case is caught by the compiler or a test.
- Abstraction comes when a second real case appears. Do not introduce an interface, a factory, or a parameter "for the future".
- One source of truth: a concept is described in one place, the rest use it rather than repeat it.
