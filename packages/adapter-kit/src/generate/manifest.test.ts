import { describe, expect, it } from "vitest";
import { KitError } from "../errors.ts";
import { KIT_MESSAGES } from "../messages/catalog.ts";
import {
  contentHash,
  EMPTY_MANIFEST,
  MANIFEST_FILE,
  manifestTextWith,
  manifestTextWithout,
  parseManifest,
  type ManifestOwner,
} from "./manifest.ts";

const ALPHA: ManifestOwner = { agent: "alpha", ownsFile: (file) => file.startsWith(".alpha/") };
const BETA: ManifestOwner = { agent: "beta", ownsFile: (file) => file.startsWith(".beta/") };

function errorOf(act: () => unknown): KitError {
  try {
    act();
  } catch (err) {
    if (err instanceof KitError) return err;

    throw err;
  }

  throw new Error("ожидалась KitError");
}

function legacyText(): string {
  return JSON.stringify({
    schemaVersion: 1,
    files: { ".alpha/a.md": "sha256:1", ".beta/b.md": "sha256:2" },
    settings: { deny: ["Read(.env)"] },
  });
}

describe("contentHash", () => {
  it("не различает перевод строки Windows и Unix", () => {
    expect(contentHash("a\r\nb\r\n")).toBe(contentHash("a\nb\n"));
  });

  it("различает разный текст", () => {
    expect(contentHash("a")).not.toBe(contentHash("b"));
  });
});

describe("manifestTextWith и parseManifest", () => {
  it("записывает и читает секцию агента, отсортировав файлы и запреты", () => {
    const text = manifestTextWith(undefined, ALPHA, {
      files: { ".alpha/b.md": "sha256:2", ".alpha/a.md": "sha256:1" },
      deny: ["z", "y"],
    });

    const manifest = parseManifest(text, ALPHA);

    expect(Object.keys(manifest.files)).toEqual([".alpha/a.md", ".alpha/b.md"]);
    expect(manifest.deny).toEqual(["y", "z"]);
    expect(text.endsWith("\n")).toBe(true);
  });

  it("пишет схему версии 2 с секцией по имени агента", () => {
    const text = manifestTextWith(undefined, ALPHA, {
      files: { ".alpha/a.md": "sha256:1" },
      deny: [],
    });

    expect(JSON.parse(text)).toEqual({
      schemaVersion: 2,
      agents: { alpha: { files: { ".alpha/a.md": "sha256:1" }, settings: { deny: [] } } },
    });
  });

  it("сохраняет секцию другого агента при записи своей", () => {
    const withAlpha = manifestTextWith(undefined, ALPHA, {
      files: { ".alpha/a.md": "sha256:1" },
      deny: ["rule"],
    });

    const text = manifestTextWith(withAlpha, BETA, {
      files: { ".beta/b.md": "sha256:2" },
      deny: [],
    });

    expect(parseManifest(text, ALPHA)).toEqual({
      files: { ".alpha/a.md": "sha256:1" },
      deny: ["rule"],
    });
    expect(parseManifest(text, BETA)).toEqual({ files: { ".beta/b.md": "sha256:2" }, deny: [] });
  });

  it("заменяет свою секцию целиком и не меняет порядок агентов", () => {
    const first = manifestTextWith(undefined, ALPHA, {
      files: { ".alpha/a.md": "sha256:1" },
      deny: [],
    });
    const both = manifestTextWith(first, BETA, { files: {}, deny: [] });

    const text = manifestTextWith(both, ALPHA, { files: { ".alpha/c.md": "sha256:3" }, deny: [] });

    expect(Object.keys(JSON.parse(text).agents)).toEqual(["alpha", "beta"]);
    expect(parseManifest(text, ALPHA).files).toEqual({ ".alpha/c.md": "sha256:3" });
  });

  it("без файла даёт пустой манифест", () => {
    expect(parseManifest(undefined, ALPHA)).toBe(EMPTY_MANIFEST);
  });

  it("без секции агента даёт пустой манифест", () => {
    const text = manifestTextWith(undefined, ALPHA, {
      files: { ".alpha/a.md": "sha256:1" },
      deny: [],
    });

    expect(parseManifest(text, BETA)).toEqual(EMPTY_MANIFEST);
  });

  it("из манифеста версии 1 берёт файлы агента по владению и запреты как есть", () => {
    const manifest = parseManifest(legacyText(), ALPHA);

    expect(manifest).toEqual({ files: { ".alpha/a.md": "sha256:1" }, deny: ["Read(.env)"] });
  });

  it("поверх манифеста версии 1 пишет версию 2 с одной своей секцией", () => {
    const text = manifestTextWith(legacyText(), ALPHA, {
      files: { ".alpha/a.md": "sha256:9" },
      deny: [],
    });

    expect(JSON.parse(text)).toEqual({
      schemaVersion: 2,
      agents: { alpha: { files: { ".alpha/a.md": "sha256:9" }, settings: { deny: [] } } },
    });
  });

  it("отвергает чужую версию схемы", () => {
    const act = () => parseManifest(JSON.stringify({ schemaVersion: 3 }), ALPHA);

    expect(errorOf(act).describe(KIT_MESSAGES.en)).toContain("unsupported schemaVersion 3");
  });

  it("отвергает не JSON с путём манифеста в тексте", () => {
    const act = () => parseManifest("{", ALPHA);

    expect(errorOf(act).describe(KIT_MESSAGES.en)).toContain(MANIFEST_FILE);
  });

  it.each([
    ["хеши не строками", { schemaVersion: 1, files: { a: 1 } }, "files must map paths to hashes"],
    [
      "запреты не списком строк",
      { schemaVersion: 1, settings: { deny: [1] } },
      "settings.deny must be a list of strings",
    ],
    [
      "хеши секции не строками",
      { schemaVersion: 2, agents: { alpha: { files: { a: 1 } } } },
      "agents.alpha.files must map paths to hashes",
    ],
    [
      "запреты секции не списком строк",
      { schemaVersion: 2, agents: { alpha: { settings: { deny: [1] } } } },
      "agents.alpha.settings.deny must be a list of strings",
    ],
    [
      "секцию не объектом",
      { schemaVersion: 2, agents: { alpha: 1 } },
      "agents.alpha. must be an object",
    ],
    ["agents не объектом", { schemaVersion: 2, agents: 1 }, "agents must be an object"],
  ])("отвергает манифест: %s", (_name, raw, message) => {
    const act = () => parseManifest(JSON.stringify(raw), ALPHA);

    expect(errorOf(act).describe(KIT_MESSAGES.en)).toContain(message);
  });
});

describe("manifestTextWithout", () => {
  it("убирает секцию агента и оставляет чужую", () => {
    const withAlpha = manifestTextWith(undefined, ALPHA, {
      files: { ".alpha/a.md": "sha256:1" },
      deny: [],
    });
    const both = manifestTextWith(withAlpha, BETA, {
      files: { ".beta/b.md": "sha256:2" },
      deny: [],
    });

    const text = manifestTextWithout(both, ALPHA);

    expect(JSON.parse(text ?? "").agents).toEqual({
      beta: { files: { ".beta/b.md": "sha256:2" }, settings: { deny: [] } },
    });
  });

  it("без оставшихся секций возвращает undefined", () => {
    const text = manifestTextWith(undefined, ALPHA, { files: {}, deny: [] });

    expect(manifestTextWithout(text, ALPHA)).toBeUndefined();
  });

  it("считает манифест версии 1 манифестом единственного агента", () => {
    expect(manifestTextWithout(legacyText(), ALPHA)).toBeUndefined();
  });

  it("без файла возвращает undefined", () => {
    expect(manifestTextWithout(undefined, ALPHA)).toBeUndefined();
  });
});
