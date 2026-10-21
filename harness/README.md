# Harness

The development process that Cyberzavod gives every project, regardless of language, framework, or model. It is a set of [Agent Skills](https://agentskills.io/specification): an agent adapter puts the skills into the project for its agent and adds what only that agent understands — roles with their models, hooks, settings. The rules of a specific project live in its AGENTS.md.

- `skills/feature/` — the lead: how a task goes through the stages of a workflow. The adapter adds the table of stages with roles and models from the project config.
- `skills/<name>/` with `stage` in `metadata` — a stage: what the stage's role does, what it receives, and in what form it answers. Metadata: `stage` — the stage, `title` — the name for humans, `role` — the role name (a stage the lead runs itself has none), `access` — `read` (only reads) or `write` (changes files).
- `skills/principles/` — principles shared by all stages, one file each in `references/`; the skill's instructions link every one of them. `always-on` in `metadata` names the principles that hold in every context: the adapter puts them into the rules the agent always reads, the rest the agent opens with the skill.
- `workflows/` — workflows: the order of stages. `default` — Plan → Code → Review → Verify → Record.

Skills use the subset of the format the harness parser accepts: `name`, `description` and a flat `metadata` of strings in the front matter, Markdown files only.

A new stage is a new skill with `stage` in its metadata and a new member of `STAGES` in `packages/core/src/stage.ts`; a new workflow is a new file in `workflows/`; a new principle is a new file in `skills/principles/references/` and a link to it in the skill's instructions.
