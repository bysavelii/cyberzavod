import { describe, expect, it } from "vitest";
import { viewerInvocationOf, viewerSpecOf } from "./viewer-package.ts";

const VERSION = "0.14.0";

describe("viewerSpecOf", () => {
  it("берёт пакет цеха той же версии, что и CLI", () => {
    const spec = viewerSpecOf({}, VERSION);

    expect(spec).toBe("@cyberzavod/viewer@0.14.0");
  });

  it("подменяется переменной CYBERZAVOD_VIEWER_PACKAGE", () => {
    const spec = viewerSpecOf({ CYBERZAVOD_VIEWER_PACKAGE: "/tmp/viewer.tgz" }, VERSION);

    expect(spec).toBe("/tmp/viewer.tgz");
  });

  it("не подменяется пустой переменной", () => {
    const spec = viewerSpecOf({ CYBERZAVOD_VIEWER_PACKAGE: "" }, VERSION);

    expect(spec).toBe("@cyberzavod/viewer@0.14.0");
  });
});

describe("viewerInvocationOf", () => {
  const cacheFirstArgs = ["-y", "--prefer-offline", "--fetch-retries=0", "--package"];

  it.each(["linux", "darwin"] as const)("на %s зовёт npx без оболочки", (platform) => {
    const invocation = viewerInvocationOf("@cyberzavod/viewer@0.14.0", platform);

    expect(invocation).toEqual({
      spec: "@cyberzavod/viewer@0.14.0",
      command: "npx",
      args: [...cacheFirstArgs, "@cyberzavod/viewer@0.14.0", "cyberzavod-viewer"],
      shell: false,
    });
  });

  it("на win32 зовёт npx.cmd через оболочку", () => {
    const invocation = viewerInvocationOf("@cyberzavod/viewer@0.14.0", "win32");

    expect(invocation).toEqual({
      spec: "@cyberzavod/viewer@0.14.0",
      command: "npx.cmd",
      args: [...cacheFirstArgs, '"@cyberzavod/viewer@0.14.0"', "cyberzavod-viewer"],
      shell: true,
    });
  });

  it.each(["C:\\my files\\viewer.tgz", "@cyberzavod/viewer@0.14.0"])(
    "на win32 всегда берёт спецификацию %s в двойные кавычки",
    (spec) => {
      const invocation = viewerInvocationOf(spec, "win32");

      expect(invocation.args.at(-2)).toBe(`"${spec}"`);
    },
  );

  it("на других платформах путь с пробелом остаётся одним аргументом без кавычек", () => {
    const invocation = viewerInvocationOf("/my files/viewer.tgz", "linux");

    expect(invocation.args.at(-2)).toBe("/my files/viewer.tgz");
  });
});
