# Cyberzavod

Cyberzavod is a local-first development harness for AI coding agents: it gives the agent you already use a fixed process, checks that must be green before the agent stops, and a journal of what happened. It does not write code and it is not an agent.

**Why.** AI agents are fast, but every project, model and tool ends up with its own prompts, rules files and habits, and nothing records why the work went the way it did. Cyberzavod keeps the process, the checks and the record the same while your stack and your agent change.

**See it work.** [cyberzavod.com](https://cyberzavod.com) replays recorded sessions on a top-down factory floor: AI agents building example projects from scratch, task by task, through this process.

## Start in 3 minutes

You need Node 22+, git and an AI coding agent: [Claude Code](https://claude.com/claude-code) or [Codex CLI](https://github.com/openai/codex), in a git repository.

```bash
cd my-project
npx cyberzavod init        # shows what it found, asks Continue? [Y/n]
```

Then open Claude Code in the project and run:

```text
/setup                     # fills in AGENTS.md from your code, runs the checks once
/feature "Add dark mode"   # one task through the whole workflow
```

With Codex CLI, connect the project with `npx cyberzavod init --agent codex` and open Codex in it. Codex skills are called with `$` instead of `/`:

```text
$setup
$feature "Add dark mode"
```

Commit what `init` and `/setup` (`$setup`) list. Optionally, `/publish-recording` (`$publish-recording`) turns the session into a recording and, only with your consent, shares it to your gallery on the site.

A project is driven by one agent. To switch, run `npx cyberzavod disconnect`, then `init --agent <agent>`.

Guides: [Cyberzavod in 3 minutes](https://cyberzavod.com/guides/getting-started/) · [full guide](https://cyberzavod.com/guides/connect-project/) (sources: [guides/](guides/), English and Russian).

## The workflow

**Plan → Code → Review → Verify → Record.** You approve the plan; stage agents write the code, review it and verify it against the plan; the stop hook keeps the agent working while the project checks are red; at the end you get commits, and decisions go to the journal. Details are in [How it works](#how-it-works).

## Current support

Cyberzavod is agent-agnostic by design. Two adapters are supported: Claude Code (the default) and Codex CLI (`init --agent codex`). Other agents are not supported yet. The CLI is built for macOS, Linux and Windows, and CI checks the packed npm package on all three (on Windows, Claude Code runs the hooks through Git Bash). The Codex hook commands are POSIX shell commands, so on Windows run Codex in WSL; the Codex hooks on native Windows are not verified.

Codex runs a project's hooks and roles only for a project you trust, and only with hooks you have approved. `init` asks one confirmation and then marks the project trusted and its hooks approved in your own Codex config (`$CODEX_HOME/config.toml`, by default `~/.codex/config.toml`); `sync` carries the approval over to the updated hooks, and `disconnect` takes back only what `init` added. The trust is never written into the project.

## Privacy

Cyberzavod is local-first. Nothing is shared unless you explicitly use sharing or publishing functionality: only the gallery commands (`login`, `share`, `unshare`, `gallery`) use the network: GitHub to sign in and the cyberzavod.com server. `init`, `sync`, `status`, `doctor` and the hooks send nothing anywhere; npx only downloads the `cyberzavod` package from npm when it is not cached. Raw session logs, which contain your prompts, stay in the journal's `capture/` directory, which `init` keeps out of git.

## Removing it

`npx cyberzavod disconnect` shows what it will remove and what it will keep, asks to confirm, and removes only what Cyberzavod added. Your code, `AGENTS.md`, the journal and your own settings stay.

## What appears in your project

- `.cyberzavod/project.json`: the project marker and config: project id, process, agent per stage, checks and the journal path. The journal is the `.cyberzavod/journal/` directory with sessions, decisions and notes as JSON files.
- `AGENTS.md`: your project rules for agents and people. An existing hand-written `CLAUDE.md` is moved here; otherwise a starter is added for `/setup` to fill in.

For Claude Code:

- `CLAUDE.md`: a thin entry point for Claude Code, generated: don't edit it by hand.
- `.claude/agents/` and `.claude/skills/`: the stage agents, the recording editor, and the `/setup`, `/feature` and `/publish-recording` skills.
- `.claude/settings.json`: the recording and stop hooks and a rule that forbids reading and editing `.env`. Your own settings and hooks in this file stay as they are.

For Codex CLI (`init --agent codex`; Codex reads `AGENTS.md` itself, so there is no `CLAUDE.md`):

- `.codex/config.toml`: the workflow rules for the agent and a raised `AGENTS.md` size limit, so Codex does not silently cut your rules.
- `.codex/agents/`: a role per stage and the recording editor.
- `.agents/skills/`: the `$setup`, `$feature` and `$publish-recording` skills.
- `.codex/hooks.json`: the recording and stop hooks and a guard that refuses `.env` and raw session logs. Your own hooks in this file stay as they are.
- In your own Codex config, outside the project: the trust for the project and its hooks (see Current support).

Both:

- `.cyberzavod/generated.json`: the generated files with their checksums, so Cyberzavod can tell its own file from one you edited.
- A `.gitignore` line for the journal's `capture/` directory.

`init` adds no tool to your project: the hooks run `npx cyberzavod@<version>` with the version from `.cyberzavod/project.json`, and the first hook run puts the package into the npm cache. Generated files carry a "Generated by `cyberzavod sync`" mark. Cyberzavod never silently overwrites a file it does not own: `init`, `sync` and `disconnect` leave your files and generated files you edited by hand alone and say so. `init` takes `--yes`, `--id`, `--check` and `--journal` (see `npx cyberzavod init --help`); running it again changes nothing and says whether `sync` is needed.

## Commands

Run every command as `npx cyberzavod <command>`.

| Section | Command | What it does |
|---|---|---|
| Getting started | `init` | Set up the project: config, `AGENTS.md`, agent files; `--agent claude\|codex` picks the agent (default `claude`) |
| Getting started | `status` | Project, workflow, stage agents, checks and the journal |
| Journal | `decision` | Record a decision in the journal |
| Journal | `note` | Record a note in the journal |
| Gallery | `login` | Sign in with GitHub to publish recordings to your gallery |
| Gallery | `logout` | Forget the saved GitHub token |
| Gallery | `share` | Send a recording from the journal to your gallery |
| Gallery | `unshare` | Remove a recording from your gallery |
| Gallery | `gallery` | Your gallery: recordings, limit, links; open or close it |
| Maintenance | `sync` | Detect the stack again and rebuild the agent files; `--diff` previews the changes, `--check` fails if anything is out of date, `--force` overwrites files you wrote |
| Maintenance | `doctor` | Check the setup and say how to fix each problem |
| Maintenance | `disconnect` | Remove Cyberzavod from the project: only what it added |

`npx cyberzavod <command> --help` lists the flags of a command. The language is set by `--lang en|ru`, `CYBERZAVOD_LANG` or the system locale. To move to a newer release, run `npx cyberzavod@latest sync`: it rewrites the generated files and the hooks for the new version. `draft`, `publish` and `hook` are called by the skills and the hooks, not by you. For scripts and CI, `status --json`, `doctor --json`, `sync --check --json` and `sync --diff --json` print one JSON document with a `schemaVersion` and stable keys.

## If something doesn't work

Run `npx cyberzavod doctor`. It prints a line for each item (✓ fine, – note, ✗ problem) and a "How to fix" line under every problem; it exits with 1 on a problem and does not use the network. An excerpt, for example:

```
✓ agent files are up to date
✗ AGENTS.md still has starter placeholders
    How to fix: run /setup in Claude Code
```

`doctor` only looks for the check commands; `npx cyberzavod doctor --run-checks` runs them too. `doctor` does not catch these cases:

- The agent was open before `init`: the session has no start in the journal. Start a new session.
- Codex ignores the roles and hooks: the project or its hooks are not trusted in your Codex config. `doctor` reports it with the fix: open Codex in the project and trust it (or add `trust_level = "trusted"` for the project to your Codex config), and approve the hooks with `/hooks`.
- The stop hook won't let the agent finish: the checks are red, fix what they print.
- No network and no package in the npm cache: the recording hooks are skipped, and the stop hook lets the agent finish with a message that the checks were skipped.

An unexpected error prints one line; run the command again with `CYBERZAVOD_DEBUG=1` to see the stack trace for a bug report.

## How it works

AI coding agents are fast, but every project, model and tool ends up with its own prompts, rules files and habits. Change the model or the agent, and the process goes with it. Nothing records why the work went the way it did. Cyberzavod keeps three things stable while everything around them changes:

- **The process.** `/feature <task>` runs the stages Plan → Code → Review → Verify → Record, with a role per stage, shared engineering principles and a human approving the plan.
- **The checks.** A per-project list of verification commands. The agent cannot finish a turn that changed code while they are red.
- **The record.** A journal of sessions, decisions and notes in one plain JSON format that works for any agent.

The stages:

1. **Plan:** the planning role studies the code and writes a plan with acceptance criteria. A human approves it.
2. **Code:** the coding role makes the change and runs the checks.
3. **Review:** the review role reads the diff against the plan and the project rules.
4. **Verify:** the verification role confirms each criterion and runs the checks.
5. **Record:** commits follow the project's rules. Decisions and notes go to the journal, and the session can be published as a recording.

Returns from review or verification go back to the coding role: the second return uses a stronger model, and the third calls the human. While the checks are red and the agent changed code in the turn, the stop hook does not let it finish; after three failed attempts it stops and calls the human.

Stack details (language, framework, package manager) are detected for convenience. They are metadata, not constraints.

## The journal and the record format

Nothing leaves your disk until you share a recording to your gallery.

- `.cyberzavod/project.json`: in the project, committed.
- The journal: by default `.cyberzavod/journal/` inside the project, so it travels with your repository. It can also live outside, for example `../<project>.cyberzavod/`.
  - `sessions/`, `decisions/` and `notes/` hold one JSON file per record. Each record has the envelope `{version, type, timestamp, projectId, sessionId, source, data}`.
  - `capture/` holds the adapter's raw session logs and drafts. It contains your original prompts and is never meant for git; `init` adds it to `.gitignore`.

The record format is the whole contract between the tool and any viewer. [cyberzavod.com](https://cyberzavod.com) is one such viewer; you can build your own on top of your journal.

## Developing Cyberzavod

| Path | What it is |
|---|---|
| `harness/` | The process: principles, stages, workflows, conductor rules. Agent- and stack-neutral |
| `packages/core` | The model: records, project config, stages, harness |
| `packages/player` | The factory-floor player: script and frame of a session record; used only by the site |
| `packages/storage` | Disk: project config, the directory record store, harness loading |
| `packages/cli` | The `cyberzavod` npm package: the CLI, bundled with everything below into one file |
| `packages/adapter-kit` | What every agent adapter shares: file ownership, hook file, recording hooks, draft and publish |
| `adapters/claude` | The Claude Code adapter: file generator, hooks, session capture |
| `adapters/codex` | The Codex CLI adapter: file generator, trust in the user's Codex config, hooks, rollout parsing; has an end-to-end test against a real `codex exec` |
| `.cyberzavod/` | This repository's own connection: config and journal; `.cyberzavod/journal/sessions/` holds the recordings the site shows: builds of the example projects |
| `projects/` | Cards of the projects whose recordings the site shows: name, description, links, stack |
| `apps/web` | The site: Astro, SolidJS, PixiJS factory floor |
| `apps/api` | The API: Go and Postgres |

The tool and the site share this repository but not code: the site only reads the record format. Releases go to npm when a `vX.Y.Z` tag is pushed; the steps are in [RELEASING.md](RELEASING.md).

To work on Cyberzavod itself: `pnpm install`, then `pnpm cyberzavod <command>` builds the CLI from source and runs it. `make dev` starts the site on http://localhost:4321 and the API, `make check` runs every check, `pnpm smoke` checks the real npm package from `init` to `disconnect` for both agents, `make check-codex` runs the Codex end-to-end test, and `make help` lists the rest. The project rules are in [AGENTS.md](AGENTS.md). There is an isolated dev container for AI agents; see [.devcontainer/README.md](.devcontainer/README.md).

## License

[MIT](LICENSE) © [bysavelii](https://bysavelii.com).
