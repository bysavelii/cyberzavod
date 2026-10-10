---
title: Cyberzavod in 3 minutes
description: Connect a project, run one task through Plan → Code → Review → Verify → Record, and remove Cyberzavod again if it is not for you.
order: 0
---

Cyberzavod gives the AI coding agent you already use a fixed development process, checks that must be green before the agent stops, and a journal of what happened. It does not write code and it is not an agent.

## What you need

- Node 22 or newer, git and an AI coding agent: [Claude Code](https://claude.com/claude-code) or [Codex CLI](https://github.com/openai/codex).
- A git repository. In an empty folder, run `git init` first.

## Five steps

1. Go to your project:

   ```bash
   cd my-project
   ```

2. Connect Cyberzavod. It shows what it found and asks `Continue? [Y/n]`:

   ```bash
   npx cyberzavod init
   ```

   For Codex CLI, run `npx cyberzavod init --agent codex`. Commit the files it lists.

3. Open Claude Code (or Codex) in the project.
4. Run `/setup` (in Codex, `$setup`). It fills in `AGENTS.md` from your code and runs the project checks once. Commit what it changed.
5. Give it a task:

   ```text
   /feature "Add dark mode"
   ```

   In Codex, skills start with `$`: `$feature "Add dark mode"`.

Done. The task goes through the workflow:

**Plan → Code → Review → Verify → Record**

You approve the plan. Agents write the code, review it and verify it against the plan. The checks must pass before the agent can stop, and at the end you get commits. If you want, `/publish-recording` turns the session into a recording you can replay on the site.

## Good to know

- **Local-first.** Cyberzavod is local-first. Nothing is shared unless you explicitly use sharing or publishing (`/publish-recording`, `share`). `init`, `sync`, `status`, `doctor` and the hooks send nothing anywhere.
- **Two agents.** Cyberzavod is agent-agnostic by design. Claude Code (the default) and Codex CLI (`init --agent codex`) are supported; other agents are not supported yet. A project is driven by one agent. Codex runs a project's hooks only for a project you trust, so `init` marks the project and its hooks trusted in your own Codex config, outside the project; `disconnect` takes that back.
- **Your files are safe.** Cyberzavod never silently overwrites a file it does not own. Running `init` again changes nothing.
- **Something is wrong?** Run `npx cyberzavod doctor`. It checks the setup and says how to fix each problem.
- **Not for you?** `npx cyberzavod disconnect` shows what it will remove and what it will keep, then removes only what Cyberzavod added. Your code, `AGENTS.md` and the journal stay.

## Next

- [Full guide](/guides/connect-project/): what appears in the project, the stages and the journal.
- [CLI reference](/guides/connect-project/#commands): every command; `npx cyberzavod <command> --help` shows its flags.
- [Troubleshooting](/guides/connect-project/#if-something-doesnt-work): `doctor` and what it does not catch.
- [How it works](/guides/connect-project/#how-it-works): roles, reworks, the stop hook and the checks.
