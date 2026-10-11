import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { noticeOf, packageDirectoriesOf, packageDirectoryOf } from "./licenses.ts";

let directory: string;

async function installPackage(name: string, files: Record<string, string>): Promise<string> {
  const packageDirectory = path.join(directory, name);

  await mkdir(packageDirectory, { recursive: true });
  await Promise.all(
    Object.entries(files).map(([file, text]) => writeFile(path.join(packageDirectory, file), text)),
  );

  return packageDirectory;
}

function manifestOf(name: string): string {
  return JSON.stringify({ name, version: "1.2.3", license: "MIT" });
}

describe("packageDirectoryOf", () => {
  it.each([
    ["/repo/node_modules/solid-js/dist/solid.js", "/repo/node_modules/solid-js"],
    ["C:\\repo\\node_modules\\solid-js\\dist\\solid.js", "C:/repo/node_modules/solid-js"],
    ["/repo/node_modules/@kobalte/core/dist/index.js", "/repo/node_modules/@kobalte/core"],
    [
      "C:\\repo\\node_modules\\@kobalte\\core\\dist\\index.js",
      "C:/repo/node_modules/@kobalte/core",
    ],
  ])("находит каталог пакета по модулю %s", (moduleId, expected) => {
    expect(packageDirectoryOf(moduleId)).toBe(expected);
  });

  it.each([
    [
      "/repo/node_modules/.pnpm/solid-js@1.9.15/node_modules/solid-js/dist/solid.js",
      "/repo/node_modules/.pnpm/solid-js@1.9.15/node_modules/solid-js",
    ],
    [
      "C:\\repo\\node_modules\\.pnpm\\solid-js@1.9.15\\node_modules\\solid-js\\dist\\solid.js",
      "C:/repo/node_modules/.pnpm/solid-js@1.9.15/node_modules/solid-js",
    ],
  ])("берёт последний node_modules: пакет pnpm лежит во вложенном (%s)", (moduleId, expected) => {
    expect(packageDirectoryOf(moduleId)).toBe(expected);
  });

  it("отбрасывает запрос в конце идентификатора модуля", () => {
    const moduleId = "/repo/node_modules/pixi.js/dist/pixi.mjs?inline";

    expect(packageDirectoryOf(moduleId)).toBe("/repo/node_modules/pixi.js");
  });

  it.each([["/repo/apps/web/src/main.tsx"], ["C:\\repo\\apps\\web\\src\\main.tsx"]])(
    "не считает пакетом код самого репозитория %s",
    (moduleId) => {
      expect(packageDirectoryOf(moduleId)).toBeUndefined();
    },
  );
});

describe("packageDirectoriesOf", () => {
  it("собирает каталоги пакетов по модулям, каждый один раз и по порядку", () => {
    const moduleIds = [
      "/repo/node_modules/b/index.js",
      "C:\\repo\\node_modules\\a\\index.js",
      "/repo/node_modules/b/other.js",
      "/repo/apps/web/src/main.tsx",
    ];

    const directories = packageDirectoriesOf(moduleIds);

    expect(directories).toEqual(["/repo/node_modules/b", "C:/repo/node_modules/a"].sort());
  });

  it("падает, когда ни один модуль не лежит в пакете", () => {
    const act = () => packageDirectoriesOf(["/repo/apps/web/src/main.tsx"]);

    expect(act).toThrow("no third-party package found among 1 modules");
  });
});

describe("noticeOf", () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "cyberzavod-licenses-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("называет пакет, версию, лицензию и приводит текст файла лицензии", async () => {
    const packageDirectory = await installPackage("alpha", {
      "package.json": manifestOf("alpha"),
      LICENSE: "MIT License\n\nCopyright (c) Alpha\n",
    });

    const notice = await noticeOf(packageDirectory);

    expect(notice).toBe("alpha 1.2.3 (MIT)\n\nMIT License\n\nCopyright (c) Alpha\n");
  });

  it("приводит все файлы лицензий пакета", async () => {
    const packageDirectory = await installPackage("beta", {
      "package.json": manifestOf("beta"),
      LICENSE: "First license",
      "LICENCE-OFL.txt": "Second license",
    });

    const notice = await noticeOf(packageDirectory);

    expect(notice).toContain("First license");
    expect(notice).toContain("Second license");
  });

  it("падает с именем пакета, у которого нет файла лицензии", async () => {
    const packageDirectory = await installPackage("gamma", {
      "package.json": manifestOf("gamma"),
      "README.md": "no license here",
    });

    const act = () => noticeOf(packageDirectory);

    await expect(act()).rejects.toThrow("gamma");
  });

  it("приводит файл NOTICE пакета вместе с файлом лицензии", async () => {
    const packageDirectory = await installPackage("delta", {
      "package.json": manifestOf("delta"),
      "LICENSE.md": "License text",
      "NOTICE.txt": "Notice text",
    });

    const notice = await noticeOf(packageDirectory);

    expect(notice).toContain("License text");
    expect(notice).toContain("Notice text");
  });

  it("принимает лицензию в старом виде объекта с полем type", async () => {
    const packageDirectory = await installPackage("legacy", {
      "package.json": JSON.stringify({
        name: "legacy",
        version: "1.0.0",
        license: { type: "ISC", url: "https://example.test" },
      }),
      LICENSE: "ISC text",
    });

    const notice = await noticeOf(packageDirectory);

    expect(notice).toContain("legacy 1.0.0 (ISC)");
  });

  it("падает, когда в манифесте нет поля license", async () => {
    const packageDirectory = await installPackage("nolicense", {
      "package.json": JSON.stringify({ name: "nolicense", version: "1.0.0" }),
      LICENSE: "text",
    });

    const act = () => noticeOf(packageDirectory);

    await expect(act()).rejects.toThrow(/nolicense.*"license"/);
  });

  it("принимает известный пакет без файла лицензии и приводит полный текст MIT с автором из манифеста", async () => {
    const packageDirectory = await installPackage("colord", {
      "package.json": JSON.stringify({
        name: "@pixi/colord",
        version: "2.9.6",
        license: "MIT",
        author: "Vlad Shilov <vlad@example.com>",
      }),
    });

    const notice = await noticeOf(packageDirectory);

    expect(notice).toContain("@pixi/colord 2.9.6 (MIT)");
    expect(notice).toContain("Copyright (c) Vlad Shilov\n");
    expect(notice).toContain("Permission is hereby granted, free of charge");
  });

  it("падает, когда автор известного пакета в манифесте сменился", async () => {
    const packageDirectory = await installPackage("colord", {
      "package.json": JSON.stringify({
        name: "@pixi/colord",
        version: "3.0.0",
        license: "MIT",
        author: "Somebody Else",
      }),
    });

    const act = () => noticeOf(packageDirectory);

    await expect(act()).rejects.toThrow("@pixi/colord 3.0.0 changed");
  });
});
