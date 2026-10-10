import { SettingsError } from "@cyberzavod/adapter-kit";
import { describe, expect, it } from "vitest";
import { codexHooks, GUARDED_TOOLS, inspectHooksFile, mergeHooksFile } from "./hooks-config.ts";

const VERSION = "1.2.3";

function commandsOf(event: string, hooks = codexHooks(VERSION)): string[] {
  return (hooks[event] ?? []).flatMap((group) => group.hooks.map(({ command }) => command));
}

describe("codexHooks", () => {
  it("зовёт CLI той версии, что в конфиге, и называет агента флагом", () => {
    const commands = commandsOf("UserPromptSubmit");

    expect(commands[0]).toContain(`cyberzavod@${VERSION} hook record --agent codex ||`);
    expect(commands[1]).toContain(`cyberzavod@${VERSION} hook turn-start --agent codex ||`);
  });

  it("ищет пакет от корня проекта, а не от каталога сессии: сессия может идти в подкаталоге", () => {
    const [command] = commandsOf("SessionStart");

    expect(command).toContain('--prefix "$(git rev-parse --show-toplevel 2>/dev/null || pwd)" ');
    expect(command).not.toContain("--prefix . ");
    expect(command).not.toContain("CLAUDE_PROJECT_DIR");
  });

  it("запускает каждую команду через sh -c: логин-оболочка не обязана понимать $(…) и ||", () => {
    const hooks = codexHooks(VERSION);

    const commands = Object.keys(hooks).flatMap((event) => commandsOf(event, hooks));

    expect(commands.every((command) => command.startsWith("sh -c 'npx "))).toBe(true);
    expect(commands.every((command) => command.endsWith("'"))).toBe(true);
  });

  it("запись остановки синхронная, остальные записи асинхронные", () => {
    const hooks = codexHooks(VERSION);

    const [asyncRecord] = hooks.SessionStart?.[0]?.hooks ?? [];
    const [stopRecord, stopGate] = hooks.Stop?.[0]?.hooks ?? [];

    expect(asyncRecord?.async).toBe(true);
    expect(stopRecord?.async).toBeUndefined();
    expect(stopGate?.statusMessage).toBeDefined();
  });

  it("ставит защиту перед оболочкой и правкой файлов", () => {
    const [group] = codexHooks(VERSION).PreToolUse ?? [];

    expect(group?.matcher).toBe(GUARDED_TOOLS);
    expect(group?.hooks[0]?.command).toContain("hook guard --agent codex");
  });

  it("отпускает агента сообщением, если команда остановки не запустилась", () => {
    const stopCommands = commandsOf("Stop");

    expect(stopCommands[1]).toContain("systemMessage");
  });
});

describe("mergeHooksFile", () => {
  it("заменяет прежние свои обработчики и оставляет чужие и прочие ключи", () => {
    const mine = { type: "command", command: "echo mine" };
    const current = {
      description: "mine",
      hooks: { Stop: [{ hooks: [mine] }, ...(codexHooks("0.1.0").Stop ?? [])] },
    };

    const merged = mergeHooksFile(current, codexHooks(VERSION));

    expect(merged.description).toBe("mine");
    expect(commandsOf("Stop", merged.hooks as ReturnType<typeof codexHooks>)).toEqual([
      "echo mine",
      ...commandsOf("Stop"),
    ]);
  });

  it("бросает SettingsError, если hooks не объект", () => {
    const act = () => mergeHooksFile({ hooks: [] }, codexHooks(VERSION));

    expect(act).toThrow(SettingsError);
  });
});

describe("inspectHooksFile", () => {
  it("говорит installed для файла после слияния", () => {
    const settings = mergeHooksFile({}, codexHooks(VERSION));

    expect(inspectHooksFile(settings, VERSION)).toEqual({ kind: "installed" });
  });

  it("говорит otherVersion, если хуки от другой версии", () => {
    const settings = mergeHooksFile({}, codexHooks("0.1.0"));

    expect(inspectHooksFile(settings, VERSION)).toMatchObject({ kind: "otherVersion" });
  });

  it("говорит missing без хуков", () => {
    expect(inspectHooksFile({}, VERSION)).toEqual({ kind: "missing" });
  });
});
