import { describe, expect, it } from "vitest";
import { claudeModelOf, claudeToolsOf, GenerateError } from "./claude.ts";

describe("claudeModelOf", () => {
  it.each([
    ["planning", undefined, "opus"],
    ["implementation", { model: "default" }, "sonnet"],
    ["review", { provider: "anthropic" }, "opus"],
    ["verification", { model: "haiku" }, "haiku"],
  ] as const)("этап %s с настройками %j работает на %s", (stage, agent, expected) => {
    const model = claudeModelOf(stage, agent);

    expect(model).toBe(expected);
  });

  it("отклоняет провайдера, которого адаптер не ведёт", () => {
    const act = () => claudeModelOf("planning", { provider: "openai" });

    expect(act).toThrow(GenerateError);
  });
});

describe("claudeToolsOf", () => {
  it("даёт роли только для чтения инструменты без правки", () => {
    const tools = claudeToolsOf("read");

    expect(tools).not.toMatch(/Edit|Write/);
  });
});
