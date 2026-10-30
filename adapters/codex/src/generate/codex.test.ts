import { DEFAULT_MODEL } from "@cyberzavod/core";
import { describe, expect, it } from "vitest";
import { CODEX_PROVIDER, CodexGenerateError, codexEffortOf, codexModelOf } from "./codex.ts";
import { CODEX_MESSAGES } from "../messages/catalog.ts";

describe("codexModelOf", () => {
  it("для постановки и ревью берёт сильную модель, для кода и проверок — рабочую", () => {
    const models = ["planning", "review", "implementation", "verification", "record"].map((stage) =>
      codexModelOf(stage as Parameters<typeof codexModelOf>[0], undefined),
    );

    expect(models).toEqual([
      "gpt-6-astra",
      "gpt-6-astra",
      "gpt-6.1-sol",
      "gpt-6.1-sol",
      "gpt-6.1-sol",
    ]);
  });

  it("берёт модель из конфига, если она не default", () => {
    const model = codexModelOf("implementation", { model: "gpt-custom" });

    expect(model).toBe("gpt-custom");
  });

  it("считает model default выбором адаптера", () => {
    const model = codexModelOf("planning", { model: DEFAULT_MODEL });

    expect(model).toBe("gpt-6-astra");
  });

  it("отклоняет этап, отданный другому провайдеру, с понятным текстом", () => {
    const act = () => codexModelOf("review", { provider: "anthropic" });

    expect(act).toThrow(CodexGenerateError);
    expect(act).toThrow(
      `stage review: anthropic is not supported by the Codex adapter, it runs only ${CODEX_PROVIDER}`,
    );
  });

  it("описывает отказ на русском через каталог", () => {
    let error: unknown;

    try {
      codexModelOf("review", { provider: "anthropic" });
    } catch (err) {
      error = err;
    }

    expect((error as CodexGenerateError).describe(CODEX_MESSAGES.ru)).toContain("этап review");
  });
});

describe("codexEffortOf", () => {
  it("даёт высокий effort на постановке и среднюю на проверках", () => {
    expect([codexEffortOf("planning"), codexEffortOf("verification")]).toEqual(["high", "medium"]);
  });
});
