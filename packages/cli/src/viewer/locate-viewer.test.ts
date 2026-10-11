import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CommandError } from "../errors.ts";
import { CLI_MESSAGES } from "../messages/catalog.ts";
import { locateViewer } from "./locate-viewer.ts";
import type { ViewerInvocation } from "./viewer-package.ts";

const SPEC = "@cyberzavod/viewer@0.14.0";

let workspace: string;

// A stand-in for npx: a Node script that prints what the test tells it to and exits with a code.
async function fakeNpx(options: { output: string; exitCode?: number }): Promise<ViewerInvocation> {
  const script = path.join(workspace, "fake-npx.mjs");
  const code = options.exitCode ?? 0;

  await writeFile(
    script,
    `process.stdout.write(${JSON.stringify(options.output)}); process.exit(${code});`,
  );

  return { spec: SPEC, command: process.execPath, args: [script], shell: false };
}

// The directory the stand-in prints is the workspace itself: it needs an index.html to count.
async function builtFloor(): Promise<void> {
  await writeFile(path.join(workspace, "index.html"), "<html>");
}

function locate(invocation: ViewerInvocation): string {
  return locateViewer(invocation, workspace, {});
}

function failureOf(invocation: ViewerInvocation): CommandError {
  try {
    locate(invocation);
  } catch (err) {
    if (err instanceof CommandError) return err;
  }

  throw new Error("locateViewer did not throw a CommandError");
}

describe("locateViewer", () => {
  beforeEach(async () => {
    workspace = await mkdtemp(path.join(tmpdir(), "cyberzavod-locate-"));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  it("берёт каталог из последней непустой строки вывода", async () => {
    await builtFloor();
    const invocation = await fakeNpx({ output: `npm notice news\n${workspace}\n\n` });

    const directory = locate(invocation);

    expect(directory).toBe(workspace);
  });

  it("запускает npx в корне проекта", async () => {
    await builtFloor();
    const script = path.join(workspace, "where.mjs");

    await writeFile(script, "process.stdout.write(process.cwd());");

    const directory = locate({
      spec: SPEC,
      command: process.execPath,
      args: [script],
      shell: false,
    });

    expect(directory).toBe(await realpath(workspace));
  });

  it("передаёт npx окружение вызова", async () => {
    await builtFloor();
    const script = path.join(workspace, "env.mjs");

    await writeFile(script, "process.stdout.write(process.env.FLOOR_DIRECTORY ?? '');");
    const invocation = { spec: SPEC, command: process.execPath, args: [script], shell: false };

    const directory = locateViewer(invocation, workspace, { FLOOR_DIRECTORY: workspace });

    expect(directory).toBe(workspace);
  });

  it("при ненулевом коде npx сообщает, что пакет недоступен", async () => {
    const invocation = await fakeNpx({ output: "", exitCode: 1 });

    const failure = failureOf(invocation);

    expect(failure.describe(CLI_MESSAGES.en)).toBe(CLI_MESSAGES.en.errors.viewerUnavailable(SPEC));
  });

  it("при пустом выводе сообщает, что пакет недоступен", async () => {
    const invocation = await fakeNpx({ output: "\n" });

    const failure = failureOf(invocation);

    expect(failure.describe(CLI_MESSAGES.ru)).toBe(CLI_MESSAGES.ru.errors.viewerUnavailable(SPEC));
  });

  it("если npx не запустился, сообщает, что пакет недоступен, и хранит причину", () => {
    const invocation = {
      spec: SPEC,
      command: path.join(workspace, "no-such-npx"),
      args: [],
      shell: false,
    };

    const failure = failureOf(invocation);

    expect({ text: failure.message, hasCause: failure.cause instanceof Error }).toEqual({
      text: CLI_MESSAGES.en.errors.viewerUnavailable(SPEC),
      hasCause: true,
    });
  });

  it("если в каталоге нет index.html, сообщает о неполном пакете", async () => {
    const invocation = await fakeNpx({ output: `${workspace}\n` });

    const failure = failureOf(invocation);

    expect(failure.describe(CLI_MESSAGES.en)).toBe(CLI_MESSAGES.en.errors.viewerBroken(workspace));
  });
});
