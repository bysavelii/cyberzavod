import { describe, expect, it } from "vitest";
import { AgentConfigError, parseAgentConfig } from "./agent.ts";

describe("parseAgentConfig", () => {
  it("принимает провайдера и модель", () => {
    const raw = { provider: "anthropic", model: "default" };

    const config = parseAgentConfig(raw);

    expect(config).toEqual(raw);
  });

  it("не добавляет отсутствующие поля", () => {
    const config = parseAgentConfig({ model: "default" });

    expect(config).toEqual({ model: "default" });
  });

  it.each([
    ["не объект", "claude", /object/],
    ["пустая модель", { model: "" }, /model/],
    ["провайдер не строкой", { provider: 1 }, /provider/],
  ])("отклоняет агента: %s", (_name, raw, message) => {
    const act = () => parseAgentConfig(raw);

    expect(act).toThrow(message);
    expect(act).toThrow(AgentConfigError);
  });
});
