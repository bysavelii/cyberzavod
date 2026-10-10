# Cyberzavod

Cyberzavod is a local-first development harness for AI coding agents. It does not write code and it is not an agent: it gives the agent you already use a fixed process (Plan → Code → Review → Verify → Record), checks that must be green before the agent stops, and a journal of sessions and decisions next to your project.

Cyberzavod is agent-agnostic by design. Two adapters are supported: Claude Code (the default) and Codex CLI (`init --agent codex`).

## Quickstart

You need Node 22+, git and Claude Code or Codex CLI. The project must be a git repository.

1. `npx cyberzavod init` in the project root (for Codex: `npx cyberzavod init --agent codex`). Commit the files it lists.
2. Open the agent in the project **after** `init` and run `/setup` (Codex: `$setup`). It fills in `AGENTS.md` from your repository and runs the checks once. Commit the files it changed.
3. `/feature "Add dark mode"` (Codex: `$feature "Add dark mode"`). The task goes through the stages: plan, code, review, verify, record. You approve the plan; at the end you get commits.
4. Optionally, `/publish-recording` (Codex: `$publish-recording`) in the same session. It turns the session into a recording and, with your consent, sends it to your gallery on [cyberzavod.com](https://cyberzavod.com).

Codex runs a project's hooks and roles only for a project you trust. `init` asks one confirmation and then marks the project trusted and its hooks approved in your own Codex config (`$CODEX_HOME/config.toml`, by default `~/.codex/config.toml`), never in the project; `disconnect` takes back only what `init` added. The hook commands are POSIX shell, so on Windows run Codex in WSL.

If something doesn't work, run `npx cyberzavod doctor`: it checks the setup and says how to fix each problem. To remove Cyberzavod, run `npx cyberzavod disconnect`: it shows its plan first and removes only what Cyberzavod added.

## Privacy

Cyberzavod is local-first. Nothing is shared unless you explicitly use sharing or publishing functionality: only the gallery commands (`login`, `share`, `unshare`, `gallery`) use the network. `init`, `sync`, `status`, `doctor` and the hooks send nothing anywhere.

Guides: [Cyberzavod in 3 minutes](https://cyberzavod.com/guides/getting-started/) and the [full guide](https://cyberzavod.com/guides/connect-project/). Commands, the record format and the source: [github.com/bysavelii/cyberzavod](https://github.com/bysavelii/cyberzavod).
