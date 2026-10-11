import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { staticFilesOf } from "./static-files.ts";

let directory: string;

async function writeFiles(files: readonly string[]): Promise<void> {
  for (const file of files) {
    const target = path.join(directory, file);

    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, file);
  }
}

describe("staticFilesOf", () => {
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "cyberzavod-static-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("называет файлы путями URL с косой чертой, в том числе во вложенных каталогах", async () => {
    await writeFiles(["index.html", "assets/app.js", "assets/fonts/body.woff2"]);

    const files = await staticFilesOf(directory);

    expect([...files.keys()].sort()).toEqual([
      "/",
      "/assets/app.js",
      "/assets/fonts/body.woff2",
      "/index.html",
    ]);
  });

  it("отдаёт по корню тот же файл, что и по /index.html", async () => {
    await writeFiles(["index.html"]);

    const files = await staticFilesOf(directory);

    expect(files.get("/")).toBe(files.get("/index.html"));
  });

  it("определяет тип содержимого по расширению", async () => {
    await writeFiles(["index.html", "a.js", "a.css", "a.woff2", "a.svg"]);

    const files = await staticFilesOf(directory);
    const types = ["/index.html", "/a.js", "/a.css", "/a.woff2", "/a.svg"].map(
      (url) => files.get(url)?.contentType,
    );

    expect(types).toEqual([
      "text/html; charset=utf-8",
      "text/javascript; charset=utf-8",
      "text/css; charset=utf-8",
      "font/woff2",
      "image/svg+xml",
    ]);
  });

  it("незнакомое расширение отдаёт как application/octet-stream", async () => {
    await writeFiles(["THIRD_PARTY_LICENSES", "a.xyz"]);

    const files = await staticFilesOf(directory);

    expect([
      files.get("/THIRD_PARTY_LICENSES")?.contentType,
      files.get("/a.xyz")?.contentType,
    ]).toEqual(["application/octet-stream", "application/octet-stream"]);
  });

  it("хранит абсолютный путь к файлу на диске", async () => {
    await writeFiles(["assets/app.js"]);

    const files = await staticFilesOf(directory);

    expect(files.get("/assets/app.js")?.file).toBe(path.join(directory, "assets", "app.js"));
  });

  it("не знает ничего, чего нет в каталоге", async () => {
    await writeFiles(["index.html"]);

    const files = await staticFilesOf(directory);

    expect(files.has("/package.json")).toBe(false);
  });
});
