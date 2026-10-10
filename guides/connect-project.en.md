---
title: Connect your project to the factory
description: Quickstart in four steps — init, /setup, /feature, /publish-recording — then what appears in the project, the commands, and how the factory works inside.
order: 1
---

## Quickstart

You need Node 22+, git and Claude Code or Codex CLI. The project must be a git repository (in an empty folder run `git init`): `/feature` wants a clean working tree and makes commits.

Cyberzavod is agent-agnostic by design. Two adapters are supported: Claude Code (the default) and Codex CLI (`init --agent codex`); other agents are not supported yet. A project is driven by one agent. Below, Codex differences are marked: skills are called with `$` instead of `/` (`$setup`, `$feature`, `$publish-recording`). A shorter version of this page: [Cyberzavod in 3 minutes](/guides/getting-started/).

1. `npx cyberzavod init` in the project root (for Codex, `npx cyberzavod init --agent codex`). If npx asks to download the package, answer `y`. `init` shows what it found and asks `Continue? [Y/n]`, then writes the config, `AGENTS.md` and the agent files and prints what to commit. Commit those files.
2. Open the agent in the project **after** `init` (a session started earlier is recorded without its start) and run `/setup` (in Codex, `$setup`). It fills in `AGENTS.md` from your repository, asks only what the code cannot tell, and runs the checks once (the commands that must pass before an agent can finish a turn). Commit the files it changed (it lists them).
3. `/feature <task>` (in Codex, `$feature <task>`). The task goes through the stages: plan, code, review, verify, record (a stage is one step of the process; most stages have their own agent). You approve the plan; at the end you get commits.
4. `/publish-recording` (in Codex, `$publish-recording`) in the same session. It turns the session into a recording (a clean copy of the task: stages, prompts, messages, time, tokens) and asks you to review it. With your consent it sends the recording to your gallery (a personal page on the site; the first time you sign in with GitHub) and prints a link like `https://cyberzavod.com/r/?id=…`. The floor, the top-down view on the site, plays the task from that link.

Finished builds you can open and watch are in the examples below.

## What appears in the project

- `.cyberzavod/project.json`: the project marker and config: project id, process, agent per stage, checks and the journal path. The journal is the `.cyberzavod/journal/` directory with sessions, decisions and notes as JSON files.
- `AGENTS.md`: project rules for agents and people. A handwritten `CLAUDE.md` that was there becomes `AGENTS.md`; otherwise a starter is added for `/setup` to fill in.
- For Claude Code, `CLAUDE.md`: a thin entry point. It is generated: don't edit it by hand.
- For Claude Code, `.claude/agents/`: the stage agents and the recording editor.
- For Claude Code, `.claude/skills/`: the `/setup`, `/feature` and `/publish-recording` skills.
- For Claude Code, `.claude/settings.json`: the recording and stop hooks and a rule that forbids reading and editing `.env`. Your own settings and hooks in this file stay as they are.
- For Codex CLI, `.codex/config.toml`: the workflow rules for the agent and a raised `AGENTS.md` size limit (Codex reads `AGENTS.md` itself, so there is no `CLAUDE.md`).
- For Codex CLI, `.codex/agents/`: a role per stage and the recording editor.
- For Codex CLI, `.agents/skills/`: the `$setup`, `$feature` and `$publish-recording` skills.
- For Codex CLI, `.codex/hooks.json`: the recording and stop hooks and a guard that refuses `.env` and raw session logs. Your own hooks in this file stay as they are.
- `.cyberzavod/generated.json`: the list of files Cyberzavod generated, with their checksums. It tells a generated file from one you edited by hand.
- a line in `.gitignore`: the journal's `capture/` directory with raw session logs stays out of git.

`--id`, `--check` and `--journal` change what `init` detected; `--yes` skips the confirmation. Details: `npx cyberzavod init --help`.

Cyberzavod never silently overwrites a file it does not own. If a file of yours stands where a generated one should go, `init` stops before writing anything and says what to do. Running `init` again in a connected project changes nothing: it says whether the files are current or `npx cyberzavod sync` is needed.

### Codex trust

Codex runs a project's hooks and roles only for a project you trust, and only with hooks you have approved. This is stored in your own Codex config (`$CODEX_HOME/config.toml`, by default `~/.codex/config.toml`), never in the project. After its single confirmation, `init --agent codex` marks the project trusted and approves the hooks it wrote; `sync` carries the approval over to the updated hooks, and `disconnect` takes back only what `init` added, leaving trust you gave yourself. It edits the file line by line and keeps your comments and order. `doctor` checks the trust and says how to fix it. The hook commands are POSIX shell: on Windows run Codex in WSL, because the hooks on native Windows are not verified.

## Commands

Run every command as `npx cyberzavod <command>`.

**Getting started**

- `init`: set up the project: config, `AGENTS.md`, agent files. `--agent claude|codex` picks the agent; the default is `claude`.
- `status`: project, workflow, stage agents, checks and the journal.

**Journal**

- `decision`: record a decision in the journal.
- `note`: record a note in the journal.

**Gallery**

- `login`: sign in with GitHub to publish recordings to your gallery.
- `logout`: forget the saved GitHub token.
- `share`: send a recording from the journal to your gallery.
- `unshare`: remove a recording from your gallery.
- `gallery`: your gallery: recordings, limit, links; open or close it.

**Maintenance**

- `sync`: detect the stack again and rebuild the agent files. `sync --diff` shows what it would add, update and remove, and what it will not touch, without changing anything. `sync --check` reports the same and exits with 1 if anything is out of date. `sync --force` overwrites a file you wrote or edited yourself in place of a generated one.
- `doctor`: check the setup and say how to fix each problem.
- `disconnect`: remove Cyberzavod from the project, see [Removing Cyberzavod](#removing-cyberzavod).

For scripts and CI, `status --json`, `doctor --json`, `sync --check --json` and `sync --diff --json` print one JSON document without colors, with a `schemaVersion` and stable keys.

`npx cyberzavod <command> --help` lists the flags of a command. The language is set by `--lang en|ru`, `CYBERZAVOD_LANG` or the system locale. To move to a newer release, run `npx cyberzavod@latest sync`: it rewrites the agent files and the hooks for the new version. `draft`, `publish` and `hook` are called by the skills and the hooks, not by you.

## If something doesn't work

Start with:

```bash
npx cyberzavod doctor
```

It prints a line for each item: ✓ is fine, – is a note, ✗ is a problem. Under every ✗ there is a "How to fix: …" line. If there is a ✗, the exit code is 1. `doctor` does not use the network. It only looks for the check commands; to run them too, use `npx cyberzavod doctor --run-checks`.

What `doctor` does not catch:

- The agent was open before `init`. The session has no start in the journal, so the recording has an empty project, version and process. You can fill them in while editing, but it is simpler to start a new session.
- Codex ignores the roles and hooks. The project or its hooks are not trusted in your Codex config; `doctor` says so. Open Codex in the project and trust it (or add `trust_level = "trusted"` for the project to your Codex config) and approve the hooks with `/hooks`.
- The stop hook won't let go. That means the checks are red: fix what they print.
- No network and no package in the npm cache. The recording hooks are skipped, and the stop hook lets the agent finish with a message that the checks were skipped.

An unexpected error prints one line. To see the stack trace for a bug report, run the command again with `CYBERZAVOD_DEBUG=1`.

## Removing Cyberzavod

```bash
npx cyberzavod disconnect
```

It first shows what it will remove and what it will keep, and asks `Continue? [Y/n]`. It removes only what Cyberzavod added: the generated `CLAUDE.md` files, the agents and skills in `.claude/` (for Codex, `.codex/` and `.agents/skills/`), its hooks and rules in `.claude/settings.json` (for Codex, `.codex/hooks.json`, and the trust it added in your Codex config), `.cyberzavod/generated.json` and `.cyberzavod/project.json`. It keeps your code, `AGENTS.md`, the journal, the `.gitignore` line, your own settings and hooks, and any generated file you edited by hand. Without a terminal, add `--yes`. Claude Code reads `CLAUDE.md`, so if you keep working with it, create a `CLAUDE.md` with one line, `@AGENTS.md`.

## Live examples

The factory has built three example projects from scratch. Each one started with a single human prompt for a series of tasks, and the lead (the `/feature` session) ran that series through the process on its own: plan, code, review, verify, record. After its series, Split the bill got more work on new human prompts. Each task is a separate recording; the project page lists its builds in task order, along with the totals: time, tokens, reworks (work sent back by review or verify) and human involvement. The dupes and doc-diff recordings are in Russian, and the Split the bill recordings are in English.

- Split the bill is a web app in TypeScript, Astro and Solid, and an English-language project: [project page](/projects/split-bill/). In the recording ["Astro + Solid migration and English project language"](/recordings/2026-10-08-f67ef011/) the project switches to English and the interface moves to Astro and Solid one commit per step: the review sends the work back twice, and the 24 screenshots before and after the move match pixel for pixel.
- dupes is a command-line tool in Rust: [project page](/projects/dupes/). In the recording ["Safe cleanup to the trash, JSON and README"](/recordings/2026-10-07-aa4e0a7d-3/) the review returns the move to the trash twice, until the tool no longer puts real files at risk.
- doc-diff compares versions of a contract, in Python: [project page](/projects/doc-diff/). The recording ["The doc-diff skeleton and text extraction from PDF and DOCX"](/recordings/2026-10-07-4948cd46/) opens the series: it holds the human's prompt for all five tasks at once.

## How it works

Cyberzavod is a harness: a ready-made set of process, roles, principles and checks. It does not write code itself and does not replace your agent. From the harness it generates the files your agent understands. Your stack may change, and so may the agent. The process stays the same. Cyberzavod is local-first. Nothing is shared unless you explicitly use sharing or publishing: only the gallery commands (`login`, `share`, `unshare`, `gallery`) use the network: GitHub to sign in and the cyberzavod.com server. `init`, `sync`, `status`, `doctor` and the hooks send nothing anywhere; npx only downloads the `cyberzavod` package from npm when it is not in the cache yet.

### Stages and roles

The lead, that is the `/feature` session itself, doesn't write code; it hands the work to the stages. Each stage is an agent from `.claude/agents/` (for Codex, a role from `.codex/agents/`) with its own model; with `model: "default"` the adapter picks it. The list is for Claude Code; Codex gets its own models, a frontier one for plan and review and a workhorse one for code and verify, and the lead calls a stage with `spawn_agent`:

- plan: `analyst`, Opus: a mistake in the plan costs the most;
- code: `coder`, Sonnet, and Opus on the second rework;
- review: `reviewer`, Opus;
- verify: `tester`, Sonnet.

How the work goes:

1. Plan. `analyst` studies the code and writes a plan with acceptance criteria. The lead shows it in full along with the questions and waits for your approval.
2. Code. `coder` does the task by the plan.
3. Review. `reviewer` reads the changes. "Needs work" is a rework.
4. Verify. `tester` checks the result against the criteria and runs the project checks. A defect is a rework.
5. Record. Commits follow the rules in `AGENTS.md`. If `AGENTS.md` describes publishing and deployment, the lead does those too. Decisions that matter in the long run go into the journal with `decision`, notes with `note`.

### Reworks

Reworks from review, verify and record are counted together:

1. the first: `coder` on its own model;
2. the second: `coder` on a stronger model;
3. the third: stop. The lead shows the remaining remarks and what has been tried, and calls you.

### The stop hook

While the checks are red and the agent changed code in this turn, the stop hook doesn't let it finish the turn. After three failed attempts in a row it stops and calls a human. Uncommitted changes made by someone else before the turn don't hold the agent.

### Checks

The checks are the commands in `verification.commands` of `.cyberzavod/project.json`; `verification.paths` lists the code directories (an empty list means the whole repository). They run in order every time an agent that changed code there stops. While they are red, the agent can't finish its turn. Don't put here anything that needs an environment the agent doesn't have, such as Docker: leave that to CI.

## The journal and the record format

The journal is the directory from the config (`journal`), `.cyberzavod/journal` by default. It is yours and lives in your repository; it can also live outside, for example `../<project>.cyberzavod`. Every record is a separate JSON file:

- `sessions/`: recordings of agent sessions;
- `decisions/`: decisions (`npx cyberzavod decision "<decision>" --why "<why>"`);
- `notes/`: notes (`npx cyberzavod note "<text>"`);
- `capture/`: the adapter's working files, raw session logs and recording drafts. They hold the original text of your prompts, so `init` hides `capture/` from git.

Every record has the same envelope: version, type, time, project, session, source (agent or human) and data. This format is the whole contract between the tool and a viewer: you can build your own floor to visualize your own journal.

`.cyberzavod/project.json` holds:

- `projectId`, the harness version, the process and the journal path;
- `agents`: for each stage `provider`, `agent` and `model`;
- `verification`: `commands` and `paths`, see "Checks" above;
- `stack`: what `init` detected, for information only.

## Publishing a recording in detail

`/publish-recording` walks you through the steps:

1. Draft. `draft` builds it from the most recent raw session log. The draft goes to `capture/<agent>/drafts/` of the journal (`capture/claude/drafts/` or `capture/codex/drafts/`).
2. Editing. The session writes the recording title and rewrites your prompts into a clean form: the main instruction and the clarifications. The `recording-editor` agent writes the messages between the stages and to you and the human interventions, that is, the moments when the automation waited for your word.
3. Human review. The skill shows tables of prompts, messages and interventions. Read them carefully: what you approve goes into the recording. Publishing scans the text for addresses and keys, but that is only a safety net.
4. Publishing. `publish` checks the format and writes `sessions/<id>.json` to the project journal.
5. Commit. If the journal is in the project repository, the skill runs the project checks and commits the recording by the rules in `AGENTS.md`.
6. Gallery. With your consent, the skill sends the recording to your gallery.

If one session handled several tasks, each one is published as a separate recording: the skill marks them up in the draft itself. You never type the gallery commands: the skill runs them. For the manual path you need `login`, `share <id>` and `gallery --public`.

### The gallery

1. Sign in with GitHub:

   ```bash
   npx cyberzavod login
   ```

   The command shows a code and the address `https://github.com/login/device`: open it, enter the code and confirm. The factory asks GitHub only for your public profile, to learn your login. The token is kept in your user settings directory (`~/.config/cyberzavod/credentials.json`, `%APPDATA%\cyberzavod` on Windows), outside the project; `logout` removes it.

2. Share the recording by its `id`, the name of the file in `sessions/` of the journal:

   ```bash
   npx cyberzavod share <id>
   ```

   Before sending, `share` checks the recording the same way the site does. In reply it prints a link like `https://cyberzavod.com/r/?id=<slug>`. Sharing the same `id` again replaces the recording, and the link stays the same.

3. The gallery is closed by default: a recording is visible only to those who have the link. To list the gallery on the site, open it:

   ```bash
   npx cyberzavod gallery --public
   ```

   An open gallery appears in the list of [galleries](/gallery/), gets its own page `/gallery/?user=<login>` and counts in the [analytics](/stats/) of builds: where the process stalls, how many tokens go, when a human is called. `gallery --private` closes it again; the links to recordings keep working.

A gallery holds up to 5 recordings; replacing a recording doesn't count as a new one. When the limit is reached, `share` lists your recordings: free a slot with `unshare <id>`. `gallery` without flags shows the recordings with their links, whether the gallery is open, and the limit. For an open gallery, `gallery` also prints a badge line for the README. The same line with a copy button is on the gallery page.

```markdown
[![Built at Cyberzavod](https://cyberzavod.com/api/badges/<login>.svg)](https://cyberzavod.com/gallery/?user=<login>)
```

The same can be done on the site, without a terminal: sign in with GitHub in the menu (on a phone, in the Builds panel) and open [your account](/me/). There you open or close the gallery, see your recordings with their links, delete the ones you no longer need and copy the badge line. Recordings are still uploaded only from the project, with `share`.

## A project on the factory's home page

The home page and the project pages of the site are built from the factory repository: recordings from its `.cyberzavod/journal/sessions/` and project cards from `projects/`. To have your project there with a card, open a pull request to the [factory repository](https://github.com/bysavelii/cyberzavod) with two files:

- the recording `.cyberzavod/journal/sessions/<id>.json` from your project journal;
- the card `projects/<id>.json`: `id`, `name` and a one-line `description` in every site language (`{ "en": …, "ru": … }`) and optional `repo` and `website`, `https` only, and `stack`: up to six labels such as `["TypeScript", "Vite"]`.

Before that, run `pnpm install` and `make check-web` in the clone: it builds the site and catches a broken card or recording.

The sources of the harness, the CLI and the Claude Code and Codex CLI adapters are in the factory repository: [`harness/`](https://github.com/bysavelii/cyberzavod/tree/main/harness), [`packages/cli`](https://github.com/bysavelii/cyberzavod/tree/main/packages/cli), [`adapters/claude`](https://github.com/bysavelii/cyberzavod/tree/main/adapters/claude) and [`adapters/codex`](https://github.com/bysavelii/cyberzavod/tree/main/adapters/codex). They ship to npm as a single package, `cyberzavod`.
