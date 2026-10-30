import { RULES_TODO_MARK } from "@cyberzavod/core";
import { describe, expect, it } from "vitest";
import { KIT_MESSAGES } from "../messages/catalog.ts";
import { KitError } from "../errors.ts";
import { MARKDOWN_GENERATED_COMMENT } from "./marks.ts";
import {
  recordingTemplateValues,
  renderTemplate,
  templateValues,
  type RecordingTemplateSource,
} from "./template.ts";

function thrownBy(action: () => unknown): KitError {
  try {
    action();
  } catch (err) {
    return err as KitError;
  }

  throw new Error("the action did not throw");
}

describe("renderTemplate", () => {
  it("подставляет значения вместо {{имя}}, в том числе повторяющиеся", () => {
    const text = renderTemplate("{{a}} and {{b}} and {{a}}", { a: "1", b: "2" });

    expect(text).toBe("1 and 2 and 1");
  });

  it("отвергает неизвестную подстановку, называя её", () => {
    const act = () => renderTemplate("{{missing}}", {});

    expect(act).toThrow(KitError);
    expect(act).toThrow("{{missing}}");
  });

  it("описывает неизвестную подстановку по-русски", () => {
    const act = () => renderTemplate("{{missing}}", {});

    const err = thrownBy(act);

    expect(err.describe(KIT_MESSAGES.ru)).toContain("{{missing}}");
  });
});

describe("templateValues", () => {
  it("даёт подстановки отметки, CLI, каталогов захвата и заглушки", () => {
    const values = templateValues({ cli: "npx cyberzavod", capture: { raw: "r", drafts: "d" } });

    expect(values).toEqual({
      generated: MARKDOWN_GENERATED_COMMENT,
      cli: "npx cyberzavod",
      raw: "r",
      drafts: "d",
      todo: RULES_TODO_MARK,
    });
  });
});

function recordingSource(rules: string, editor: string): RecordingTemplateSource {
  return {
    cli: "npx cyberzavod",
    capture: { raw: "r", drafts: "d" },
    fragments: { rules, editor },
    terms: {
      feature: "$feature",
      publishSkill: "skills/p.md",
      interventionWords: "his words",
      agentFlag: "--agent mock",
    },
  };
}

describe("recordingTemplateValues", () => {
  it("подставляет в общие фрагменты те же значения, что и в шаблон", () => {
    const source = recordingSource(
      "run `{{feature}}` via {{cli}}: {{interventionWords}}",
      "{{publishSkill}} in {{drafts}}",
    );

    const values = recordingTemplateValues(source);

    expect([values.recordingRules, values.recordingEditor]).toEqual([
      "run `$feature` via npx cyberzavod: his words",
      "skills/p.md in d",
    ]);
  });

  it("подставляет флаг агента в общие фрагменты", () => {
    const source = recordingSource("{{cli}} draft {{agentFlag}}", "");

    const values = recordingTemplateValues(source);

    expect(values.recordingRules).toBe("npx cyberzavod draft --agent mock");
  });

  it("сохраняет значения обычных подстановок и слова агента", () => {
    const source = recordingSource("", "");

    const values = recordingTemplateValues(source);

    expect(values).toMatchObject({
      cli: "npx cyberzavod",
      feature: "$feature",
      generated: MARKDOWN_GENERATED_COMMENT,
    });
  });

  it("отвергает неизвестную подстановку во фрагменте", () => {
    const source = recordingSource("{{missing}}", "");

    const act = () => recordingTemplateValues(source);

    expect(act).toThrow("{{missing}}");
  });

  it("не подставляет значения в уже подставленный текст", () => {
    const source = recordingSource("{{interventionWords}}", "");
    const tricky = { ...source, terms: { ...source.terms, interventionWords: "{{cli}}" } };

    const values = recordingTemplateValues(tricky);

    expect(values.recordingRules).toBe("{{cli}}");
  });
});
