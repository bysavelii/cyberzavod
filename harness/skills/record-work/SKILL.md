---
name: record-work
description: Records the accepted work — commits by the project rules and the session recording in the journal. Use when the work has passed review and verification.
metadata:
  stage: record
  title: Record
---

The lead does this stage itself, without a separate agent.

1. Commits are small and cohesive, in the format from AGENTS.md. If the task came from a tracker, the commit that closes it refers to it the way AGENTS.md requires.
2. Publishing and rollout — only if AGENTS.md describes them for this project; a failure after publishing is a rework.
3. Decisions made along the way that matter for the long term — with a `npx cyberzavod decision` entry; notes — `npx cyberzavod note`. The agent adapter writes the session journal, and the recording from it is published separately.
