import { LEGACY_TOOL_FILE } from "@cyberzavod/storage";
import { describe, expect, it } from "vitest";
import { KitError } from "../errors.ts";
import { KIT_MESSAGES } from "../messages/catalog.ts";
import {
  hookCommand,
  hookNameOf,
  inPosixShell,
  inspectHooks,
  isOwnHandler,
  mergedHooks,
  parseSettings,
  SettingsError,
  stopFailureCommand,
  withoutOwnHooks,
  type AdapterHooks,
} from "./hook-config.ts";

function ownCommand(version: string, hook = "record"): string {
  return hookCommand({
    runner: "npx -y --prefix .",
    version,
    hook,
    onFailure: "true",
  });
}

function ownHooks(version: string): AdapterHooks {
  return {
    Stop: [{ hooks: [{ type: "command", command: ownCommand(version, "stop") }] }],
    SessionStart: [{ hooks: [{ type: "command", command: ownCommand(version) }] }],
  };
}

const HUMAN = { type: "command", command: "echo mine" } as const;

describe("hookCommand", () => {
  it("запускает пакет нужной версии и подставляет запасной путь", () => {
    const command = hookCommand({
      runner: "npx -y",
      version: "1.2.3",
      hook: "stop",
      onFailure: "true",
    });

    expect(command).toBe("npx -y cyberzavod@1.2.3 hook stop || true");
  });

  it("называет агента флагом, если он задан", () => {
    const command = hookCommand({
      runner: "npx -y",
      version: "1.2.3",
      hook: "stop",
      agentFlag: "--agent codex",
      onFailure: "true",
    });

    expect(command).toBe("npx -y cyberzavod@1.2.3 hook stop --agent codex || true");
  });
});

describe("stopFailureCommand", () => {
  it("печатает JSON с systemMessage без апострофов, чтобы уместиться в одинарные кавычки", () => {
    const command = stopFailureCommand();
    const json = command.slice("echo '".length, -1);

    expect(JSON.parse(json)).toHaveProperty("systemMessage");
    expect(json).not.toContain("'");
  });
});

describe("inPosixShell", () => {
  it("кладёт команду в одинарные кавычки: путь с пробелами и запасной путь остаются внутри", () => {
    const command = 'npx --prefix "$(pwd)" cyberzavod@1.2.3 hook stop || true';

    const wrapped = inPosixShell(command);

    expect(wrapped).toBe(`sh -c '${command}'`);
  });

  it("закрывает, экранирует и снова открывает одинарную кавычку внутри команды", () => {
    const wrapped = inPosixShell("echo 'a b'");

    expect(wrapped).toBe("sh -c 'echo '\\''a b'\\'''");
  });
});

describe("isOwnHandler", () => {
  it("узнаёт обработчик, обёрнутый в sh -c", () => {
    const command = inPosixShell(ownCommand("0.1.0"));

    expect(isOwnHandler({ type: "command", command })).toBe(true);
  });

  it("узнаёт обработчик по пакету и имени хука при любых флагах npx", () => {
    expect(isOwnHandler({ type: "command", command: ownCommand("0.1.0") })).toBe(true);
    expect(isOwnHandler({ type: "command", command: "npx -y --other cyberzavod@9 hook x" })).toBe(
      true,
    );
  });

  it("узнаёт прежний вшитый CLI", () => {
    expect(isOwnHandler({ type: "command", command: `node ${LEGACY_TOOL_FILE} record` })).toBe(
      true,
    );
  });

  it("не принимает чужой обработчик", () => {
    expect(isOwnHandler(HUMAN)).toBe(false);
  });
});

describe("hookNameOf", () => {
  it("читает имя хука из команды, которую собрал hookCommand", () => {
    const command = hookCommand({
      runner: "npx -y --prefix .",
      version: "1.2.3",
      hook: "turn-start",
      agentFlag: "--agent codex",
      onFailure: "true",
    });

    const name = hookNameOf({ type: "command", command });

    expect(name).toBe("turn-start");
  });

  it("читает имя хука из команды в sh -c", () => {
    const command = inPosixShell(ownCommand("1.2.3", "guard"));

    const name = hookNameOf({ type: "command", command });

    expect(name).toBe("guard");
  });

  it("не даёт имени чужому обработчику и прежнему вшитому CLI", () => {
    const names = [
      hookNameOf(HUMAN),
      hookNameOf({ type: "command", command: `node ${LEGACY_TOOL_FILE} record` }),
    ];

    expect(names).toEqual([undefined, undefined]);
  });
});

describe("parseSettings", () => {
  it("без файла даёт пустой объект", () => {
    expect(parseSettings(undefined, "f.json")).toEqual({});
  });

  it("отвергает не JSON и не объект с путём файла в тексте", () => {
    const notJson = () => parseSettings("{", "f.json");
    const notObject = () => parseSettings("[]", "f.json");

    expect(captured(notJson).describe(KIT_MESSAGES.en)).toContain("f.json");
    expect(captured(notObject).describe(KIT_MESSAGES.en)).toContain("f.json");
  });
});

function captured(act: () => unknown): KitError {
  try {
    act();
  } catch (err) {
    if (err instanceof KitError) return err;

    throw err;
  }

  throw new Error("ожидалась KitError");
}

describe("mergedHooks", () => {
  it("заменяет прежние свои обработчики, оставляет чужие и ставит новые в конец", () => {
    const existing = {
      Stop: [{ hooks: [HUMAN] }, ...(ownHooks("0.1.0").Stop ?? [])],
    };

    const merged = mergedHooks(existing, ownHooks("0.2.0"));

    expect(merged.Stop).toEqual([{ hooks: [HUMAN] }, ...(ownHooks("0.2.0").Stop ?? [])]);
    expect(merged.SessionStart).toEqual(ownHooks("0.2.0").SessionStart);
  });

  it("оставляет события человека, которых адаптер не касается", () => {
    const merged = mergedHooks({ PreCompact: [{ hooks: [HUMAN] }] }, ownHooks("0.2.0"));

    expect(merged.PreCompact).toEqual([{ hooks: [HUMAN] }]);
  });

  it("отвергает hooks не объектом и события не списком групп", () => {
    expect(() => mergedHooks([], ownHooks("1"))).toThrow(SettingsError);
    expect(() => mergedHooks({ Stop: {} }, ownHooks("1"))).toThrow("hooks.Stop must be a list");
  });
});

describe("withoutOwnHooks", () => {
  it("убирает свои обработчики и опустевшие события", () => {
    const hooks = mergedHooks({ Stop: [{ hooks: [HUMAN] }] }, ownHooks("1"));

    const rest = withoutOwnHooks(hooks);

    expect(rest).toEqual({ Stop: [{ hooks: [HUMAN] }] });
  });
});

describe("inspectHooks", () => {
  const expected = ownHooks("1.0.0");

  it("говорит installed, если все обработчики версии на месте", () => {
    const hooks = mergedHooks({}, expected);

    expect(inspectHooks({ hooks, expected, version: "1.0.0" })).toEqual({ kind: "installed" });
  });

  it("говорит missing, если своих обработчиков нет", () => {
    expect(
      inspectHooks({ hooks: { Stop: [{ hooks: [HUMAN] }] }, expected, version: "1.0.0" }),
    ).toEqual({ kind: "missing" });
  });

  it("называет найденные версии без повторов", () => {
    const hooks = mergedHooks({}, ownHooks("0.1.0"));

    expect(inspectHooks({ hooks, expected, version: "1.0.0" })).toEqual({
      kind: "otherVersion",
      found: ["0.1.0"],
    });
  });

  it("называет события, где не хватает обработчика", () => {
    const hooks = { SessionStart: expected.SessionStart };

    expect(inspectHooks({ hooks, expected, version: "1.0.0" })).toEqual({
      kind: "incomplete",
      events: ["Stop"],
    });
  });
});
