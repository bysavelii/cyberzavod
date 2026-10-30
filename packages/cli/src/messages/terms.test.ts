import { describe, expect, it } from "vitest";
import type { AgentTerms } from "./cli-messages.ts";
import { CLI_MESSAGES } from "./catalog.ts";

const CLAUDE_TERMS: AgentTerms = { product: "Claude Code", skill: (name) => `/${name}` };
const CODEX_TERMS: AgentTerms = { product: "Codex", skill: (name) => `$${name}` };

describe("CLI_MESSAGES", () => {
  it("для Claude Code остаются теми же, что были до второго агента", () => {
    const { en, ru } = CLI_MESSAGES;

    expect([
      en.init.nextSteps(CLAUDE_TERMS),
      en.init.checksMissing({ file: "f.json", terms: CLAUDE_TERMS }),
      en.sync.neverTouched(CLAUDE_TERMS),
      en.doctor.rules.create(CLAUDE_TERMS),
      en.doctor.rules.fill(CLAUDE_TERMS),
      en.doctor.commands.setUp({ file: "f.json", terms: CLAUDE_TERMS }),
      en.disconnect.keepSettings(CLAUDE_TERMS),
      ru.init.nextSteps(CLAUDE_TERMS),
      ru.sync.neverTouched(CLAUDE_TERMS),
      ru.disconnect.keepSettings(CLAUDE_TERMS),
    ]).toEqual([
      "Next: open Claude Code and run /setup, then /feature <task>.",
      "Checks: none found — /setup or edit f.json",
      "Never touched: AGENTS.md, your own Claude Code settings and hooks, the journal, your code.",
      "create it or run /setup in Claude Code",
      "run /setup in Claude Code",
      "run /setup in Claude Code or add the commands to f.json",
      "your own Claude Code settings, hooks and permission rules",
      "Дальше: откройте Claude Code и запустите /setup, затем /feature <задача>.",
      "Не трогает никогда: AGENTS.md, ваши настройки и хуки Claude Code, журнал, ваш код.",
      "ваши настройки, хуки и запреты Claude Code",
    ]);
  });

  it("для Codex называют Codex и вызывают скиллы через $", () => {
    const { en } = CLI_MESSAGES;

    expect([
      en.init.nextSteps(CODEX_TERMS),
      en.doctor.rules.fill(CODEX_TERMS),
      en.disconnect.keepSettings(CODEX_TERMS),
    ]).toEqual([
      "Next: open Codex and run $setup, then $feature <task>.",
      "run $setup in Codex",
      "your own Codex settings, hooks and permission rules",
    ]);
  });

  it("подсказка disconnect называет собственный файл правил агента", () => {
    const { en } = CLI_MESSAGES;

    const hint = en.disconnect.agentRulesHint({
      rulesFile: "AGENTS.md",
      terms: CLAUDE_TERMS,
      agentRulesFile: "CLAUDE.md",
    });

    expect(hint).toBe(
      "Claude Code reads CLAUDE.md: to keep your AGENTS.md rules in Claude Code, create CLAUDE.md with the single line @AGENTS.md.",
    );
  });
});
