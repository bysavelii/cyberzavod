import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { browserCommandOf, launchBrowser } from "./browser.ts";

const URL_WITH_AMPERSAND = "http://127.0.0.1:4000/?lang=ru&x=1";

describe("browserCommandOf", () => {
  it("на macOS зовёт open", () => {
    const command = browserCommandOf(URL_WITH_AMPERSAND, "darwin");

    expect(command).toEqual({ command: "open", args: [URL_WITH_AMPERSAND] });
  });

  it("на Windows зовёт rundll32 без разбора адреса оболочкой", () => {
    const command = browserCommandOf(URL_WITH_AMPERSAND, "win32");

    expect(command).toEqual({
      command: "rundll32",
      args: ["url.dll,FileProtocolHandler", URL_WITH_AMPERSAND],
    });
  });

  it.each(["linux", "freebsd", "openbsd"] as const)("на %s зовёт xdg-open", (platform) => {
    const command = browserCommandOf(URL_WITH_AMPERSAND, platform);

    expect(command).toEqual({ command: "xdg-open", args: [URL_WITH_AMPERSAND] });
  });
});

// A program that runs until the test lets it go, and gives up on its own after a while.
const WAIT_FOR_RELEASE = `
  const { existsSync } = require("node:fs");
  const timer = setInterval(() => existsSync(process.argv[1]) && clearInterval(timer), 50);
  setTimeout(() => clearInterval(timer), 10000);
`;

describe("launchBrowser", () => {
  it("сообщает об успехе, не дожидаясь, пока программа закончит", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "cyberzavod-browser-"));
    const release = path.join(directory, "release");

    onTestFinished(async () => {
      await writeFile(release, "");
      await rm(directory, { recursive: true, force: true });
    });

    const isStarted = await launchBrowser({
      command: process.execPath,
      args: ["-e", WAIT_FOR_RELEASE, release],
    });

    expect({ isStarted, hasFinished: existsSync(release) }).toEqual({
      isStarted: true,
      hasFinished: false,
    });
  });

  it("сообщает о неудаче, если программы нет", async () => {
    const isStarted = await launchBrowser({ command: "cyberzavod-no-such-browser", args: [] });

    expect(isStarted).toBe(false);
  });
});
