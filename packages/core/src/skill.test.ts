import { describe, expect, it } from "vitest";
import { parseSkillDocument, SkillError, skillFrontmatter, yamlString } from "./skill.ts";

function skillText(header: string, body = "Инструкции."): string {
  return `---\n${header}\n---\n\n${body}\n`;
}

describe("parseSkillDocument", () => {
  it("читает имя, описание, metadata и инструкции", () => {
    const text = skillText(
      "name: review-changes\ndescription: Проверяет правки.\nmetadata:\n  stage: review\n  role: reviewer",
    );

    const document = parseSkillDocument(text);

    expect(document).toEqual({
      name: "review-changes",
      description: "Проверяет правки.",
      metadata: { stage: "review", role: "reviewer" },
      body: "Инструкции.",
    });
  });

  it("читает строки в двойных и одинарных кавычках", () => {
    const text = skillText(
      "name: feature\ndescription: \"Ведёт задачу. Usage: /feature\"\nmetadata:\n  title: 'It''s'",
    );

    const document = parseSkillDocument(text);

    expect([document.description, document.metadata.title]).toEqual([
      "Ведёт задачу. Usage: /feature",
      "It's",
    ]);
  });

  it("читает файл с переводами строк Windows", () => {
    const text = skillText("name: feature\ndescription: Ведёт задачу.").replace(/\n/g, "\r\n");

    const document = parseSkillDocument(text);

    expect(document.body).toBe("Инструкции.");
  });

  it("отклоняет файл без шапки", () => {
    const act = () => parseSkillDocument("Просто текст.");

    expect(act).toThrow(SkillError);
  });

  it.each(["Review", "review--changes", "-review"])("отклоняет имя %s", (name) => {
    const text = skillText(`name: ${name}\ndescription: Проверяет.`);

    const act = () => parseSkillDocument(text);

    expect(act).toThrow(SkillError);
  });

  it("отклоняет имя длиннее 64 символов", () => {
    const text = skillText(`name: ${"a".repeat(65)}\ndescription: Проверяет.`);

    const act = () => parseSkillDocument(text);

    expect(act).toThrow(/name/);
  });

  it("отклоняет шапку без описания", () => {
    const act = () => parseSkillDocument(skillText("name: feature"));

    expect(act).toThrow(/description/);
  });

  it("отклоняет описание длиннее 1024 символов", () => {
    const text = skillText(`name: feature\ndescription: ${"а".repeat(1025)}`);

    const act = () => parseSkillDocument(text);

    expect(act).toThrow(/description/);
  });

  it("отклоняет поле, которого нет в поддерживаемом подмножестве", () => {
    const text = skillText("name: feature\ndescription: Ведёт задачу.\nlicense: MIT");

    const act = () => parseSkillDocument(text);

    expect(act).toThrow(/license/);
  });

  it("отклоняет повтор ключа в шапке", () => {
    const text = skillText("name: a\nname: b\ndescription: Ведёт задачу.");

    const act = () => parseSkillDocument(text);

    expect(act).toThrow(/key name repeats/);
  });

  it("отклоняет повтор ключа в metadata", () => {
    const text = skillText(
      "name: a\ndescription: Ведёт.\nmetadata:\n  stage: review\n  stage: record",
    );

    const act = () => parseSkillDocument(text);

    expect(act).toThrow(/key stage repeats/);
  });

  it("отклоняет значение в строке metadata", () => {
    const text = skillText("name: a\ndescription: Ведёт.\nmetadata: oops");

    const act = () => parseSkillDocument(text);

    expect(act).toThrow(/metadata must be a map/);
  });

  it("отклоняет значение с переводом строки", () => {
    const text = skillText('name: a\ndescription: Ведёт.\nmetadata:\n  title: "x\\ny"');

    const act = () => parseSkillDocument(text);

    expect(act).toThrow(/line break/);
  });

  it("считает длину описания в символах, а не в единицах UTF-16", () => {
    const text = skillText(`name: feature\ndescription: ${"😀".repeat(1024)}`);

    const document = parseSkillDocument(text);

    expect([...document.description]).toHaveLength(1024);
  });

  it("отклоняет строку шапки, которая не поле", () => {
    const text = skillText("name: feature\nэто не поле\ndescription: Ведёт задачу.");

    const act = () => parseSkillDocument(text);

    expect(act).toThrow(/not a field/);
  });
});

describe("yamlString", () => {
  it("оставляет простую строку без кавычек", () => {
    const scalar = yamlString("Checks the changes — before a commit.");

    expect(scalar).toBe("Checks the changes — before a commit.");
  });

  it("берёт в кавычки строку, которую YAML прочитал бы иначе", () => {
    const values = ["Usage: /feature", "true", "1.0", "#tag", " padded", "a\nb", "a\t# b", ".inf"];

    const scalars = values.map(yamlString);

    expect(scalars).toEqual(values.map((value) => JSON.stringify(value)));
  });
});

describe("skillFrontmatter", () => {
  it("пишет шапку, которую parseSkillDocument читает обратно", () => {
    const frontmatter = {
      name: "feature",
      description: "Runs a task. Usage: /feature <task>.",
      metadata: { stage: "review", title: "true" },
      agentFields: { "argument-hint": "<task>" },
    };

    const text = `${skillFrontmatter(frontmatter)}\n\nBody.\n`;

    expect(text).toContain("argument-hint: <task>");
    expect(parseSkillDocument(text.replace("argument-hint: <task>\n", ""))).toEqual({
      name: frontmatter.name,
      description: frontmatter.description,
      metadata: frontmatter.metadata,
      body: "Body.",
    });
  });

  it("не пишет metadata, если она пустая", () => {
    const frontmatter = { name: "setup", description: "Fills in.", metadata: {}, agentFields: {} };

    const text = skillFrontmatter(frontmatter);

    expect(text).toBe("---\nname: setup\ndescription: Fills in.\n---");
  });
});
