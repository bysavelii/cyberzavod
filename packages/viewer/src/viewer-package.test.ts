import { execFileSync } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const PACKAGE = path.resolve(import.meta.dirname, "..");
const BIN = path.join(PACKAGE, "bin/cyberzavod-viewer.mjs");
const CLI_MANIFEST = path.join(PACKAGE, "../cli/package.json");
const EXTERNAL_ADDRESS = /https?:\/\//;
const ADDRESS_IN_CODE = /https?:\/\/[^\s"'`)\\]+/g;
// Namespace names are identifiers, not addresses that anything fetches; the Pixi address is in its
// start-up banner for the console.
const ALLOWED_ADDRESSES: readonly string[] = [
  "http://www.w3.org/2000/svg",
  "http://www.w3.org/1999/xlink",
  "http://www.w3.org/1999/xhtml",
  "http://www.w3.org/1998/Math/MathML",
  "http://www.w3.org/XML/1998/namespace",
  "http://www.pixijs.com/",
];

// The bin is what npx runs, so the test runs it the same way.
function printedByBin(): string {
  return execFileSync(process.execPath, [BIN], { encoding: "utf8" }).trim();
}

async function assetTexts(directory: string): Promise<string[]> {
  const assets = path.join(directory, "assets");
  const names = await readdir(assets);
  const scripts = names.filter((name) => /\.(js|css)$/.test(name));

  return Promise.all(scripts.map((name) => readFile(path.join(assets, name), "utf8")));
}

async function versionOf(manifest: string): Promise<string> {
  const { version } = JSON.parse(await readFile(manifest, "utf8")) as { version: string };

  return version;
}

describe("cyberzavod-viewer", () => {
  it("печатает каталог собранного цеха, где лежит index.html", async () => {
    const directory = printedByBin();

    const index = await stat(path.join(directory, "index.html"));

    expect(index.isFile()).toBe(true);
  });

  it("печатает абсолютный путь внутри пакета", () => {
    const directory = printedByBin();

    expect(directory).toBe(path.join(PACKAGE, "dist") + path.sep);
  });

  it("не ссылается из index.html на внешние адреса: без сети ничего не грузится", async () => {
    const index = await readFile(path.join(printedByBin(), "index.html"), "utf8");

    expect(index).not.toMatch(EXTERNAL_ADDRESS);
  });

  it("не ссылается из скриптов и стилей на внешние адреса, кроме имён пространств имён", async () => {
    const texts = await assetTexts(printedByBin());

    const addresses = texts.flatMap((text) => text.match(ADDRESS_IN_CODE) ?? []);
    const external = addresses.filter((address) => !ALLOWED_ADDRESSES.includes(address));

    expect(external).toEqual([]);
  });

  it("кладёт в сборку перечень лицензий сторонних пакетов", async () => {
    const notices = await readFile(path.join(printedByBin(), "THIRD_PARTY_LICENSES"), "utf8");

    expect(notices).toContain("pixi.js");
  });

  it("той же версии, что пакет cyberzavod", async () => {
    const versions = await Promise.all([
      versionOf(path.join(PACKAGE, "package.json")),
      versionOf(CLI_MANIFEST),
    ]);

    expect(versions[0]).toBe(versions[1]);
  });
});
