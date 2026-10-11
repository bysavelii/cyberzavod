import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { adapters, adaptersShowing } from "../agents/fixtures.ts";
import { CommandError } from "../errors.ts";
import { HARNESS_VERSION } from "../installation/installation.ts";
import { CLI_MESSAGES } from "../messages/catalog.ts";
import {
  captureOutput,
  temporaryProject,
  validSession,
  writeSessionFile,
} from "../sharing/fixtures.ts";
import type { ViewerServer } from "../viewer/server.ts";
import { startView, type ViewOptions } from "./view.ts";

const messages = CLI_MESSAGES.en;
const INDEX_TEXT = "<!doctype html><title>factory</title>";
const SESSION_ID = "2026-10-07-first";
const DRAFT_ID = "draft-build";

interface RecordingIds {
  published: string[];
  drafts: string[];
}

let floor: string;
let server: ViewerServer | undefined;

async function snapshotOf(root: string): Promise<Record<string, string>> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  const texts = await Promise.all(
    files.map(async (entry) => {
      const file = path.join(entry.parentPath, entry.name);

      return [path.relative(root, file), await readFile(file, "utf8")] as const;
    }),
  );

  return Object.fromEntries(texts);
}

function viewOptions(patch: Partial<ViewOptions> = {}): ViewOptions {
  return {
    messages,
    language: "en",
    adapters: adaptersShowing([validSession(DRAFT_ID)]),
    env: {},
    locate: () => floor,
    open: () => Promise.resolve(true),
    isOpening: true,
    ...patch,
  };
}

async function view(directory: string, patch: Partial<ViewOptions> = {}): Promise<ViewerServer> {
  server = await startView(directory, viewOptions(patch));

  return server;
}

async function recordingIdsAt(running: ViewerServer): Promise<RecordingIds> {
  const reply = await fetch(`${running.url}api/recordings`);
  const recordings = (await reply.json()) as {
    published: { id: string }[];
    drafts: { id: string }[];
  };

  return {
    published: recordings.published.map((record) => record.id),
    drafts: recordings.drafts.map((record) => record.id),
  };
}

// The human's visit: the page and the list.
async function visitFloor(root: string): Promise<void> {
  const running = await view(root);

  await fetch(running.url);
  await recordingIdsAt(running);
}

describe("startView", () => {
  const printed = captureOutput();

  beforeEach(async () => {
    floor = await mkdtemp(path.join(tmpdir(), "cyberzavod-floor-"));
    await writeFile(path.join(floor, "index.html"), INDEX_TEXT);
  });

  afterEach(async () => {
    await server?.close();
    server = undefined;
    await rm(floor, { recursive: true, force: true });
  });

  it("вне проекта бросает projectNotFound с путём каталога", async () => {
    const outside = await mkdtemp(path.join(tmpdir(), "cyberzavod-outside-"));

    onTestFinished(() => rm(outside, { recursive: true, force: true }));

    const act = () => view(outside);

    await expect(act()).rejects.toMatchObject({
      message: messages.errors.projectNotFound(outside),
    });
  });

  it("печатает адрес цеха на loopback с языком CLI", async () => {
    const root = await temporaryProject();

    const running = await view(root, { language: "ru", messages: CLI_MESSAGES.ru });

    expect(printed()).toContain(`цех: ${running.url}?lang=ru`);
    expect(running.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
  });

  it("до запроса пакета говорит, что первый запуск скачивает его", async () => {
    const root = await temporaryProject();
    const printedAtLocate: string[] = [];
    const locate = () => {
      printedAtLocate.push(printed());

      return floor;
    };

    await view(root, { locate });

    expect(printedAtLocate).toEqual([
      messages.view.preparing(`@cyberzavod/viewer@${HARNESS_VERSION}`),
    ]);
  });

  it("подсказывает, как остановить", async () => {
    const root = await temporaryProject();

    await view(root);

    expect(printed()).toContain(messages.view.stopHint);
  });

  it("просит пакет цеха той же версии, что и CLI", async () => {
    const root = await temporaryProject();
    const locate = vi.fn(() => floor);

    await view(root, { locate });

    expect(locate).toHaveBeenCalledWith(`@cyberzavod/viewer@${HARNESS_VERSION}`, root);
  });

  it("берёт спецификацию из CYBERZAVOD_VIEWER_PACKAGE", async () => {
    const root = await temporaryProject();
    const locate = vi.fn(() => floor);

    await view(root, { locate, env: { CYBERZAVOD_VIEWER_PACKAGE: "/tmp/viewer.tgz" } });

    expect(locate).toHaveBeenCalledWith("/tmp/viewer.tgz", root);
  });

  it("если пакет цеха недоступен, бросает viewerUnavailable и ничего не запускает", async () => {
    const root = await temporaryProject();
    const unavailable = new CommandError((m) => m.errors.viewerUnavailable("spec"));
    const open = vi.fn(() => Promise.resolve(true));

    const act = () =>
      view(root, {
        open,
        locate: () => {
          throw unavailable;
        },
      });

    await expect(act()).rejects.toBe(unavailable);
    expect({
      opened: open.mock.calls.length,
      printedAddress: printed().includes("factory floor: http"),
    }).toEqual({ opened: 0, printedAddress: false });
  });

  it("открывает браузер по напечатанному адресу", async () => {
    const root = await temporaryProject();
    const open = vi.fn(() => Promise.resolve(true));

    const running = await view(root, { open });

    expect(open).toHaveBeenCalledWith(`${running.url}?lang=en`);
    expect(printed()).not.toContain(messages.view.openFailed);
  });

  it("если браузер не открылся, просит открыть адрес самому, а сервер работает", async () => {
    const root = await temporaryProject();

    const running = await view(root, { open: () => Promise.resolve(false) });

    expect(printed()).toContain(messages.view.openFailed);
    expect((await fetch(running.url)).status).toBe(200);
  });

  it("с isOpening false не трогает браузер, но адрес печатает", async () => {
    const root = await temporaryProject();
    const open = vi.fn(() => Promise.resolve(true));

    const running = await view(root, { open, isOpening: false });

    expect(open).not.toHaveBeenCalled();
    expect(printed()).toContain(`factory floor: ${running.url}?lang=en`);
  });

  it("отдаёт страницу цеха", async () => {
    const root = await temporaryProject();
    const running = await view(root);

    const page = await fetch(running.url);

    expect(await page.text()).toBe(INDEX_TEXT);
  });

  it("отдаёт записи и черновики проекта", async () => {
    const root = await temporaryProject();

    await writeSessionFile(root, SESSION_ID, JSON.stringify(validSession(SESSION_ID)));
    const running = await view(root);

    const recordings = await recordingIdsAt(running);

    expect(recordings).toEqual({ published: [SESSION_ID], drafts: [DRAFT_ID] });
  });

  it("берёт черновики у адаптера проекта", async () => {
    const root = await temporaryProject();
    const running = await view(root, { adapters });

    const recordings = await recordingIdsAt(running);

    expect(recordings.drafts).toEqual([]);
  });

  it("при битом журнале отвечает браузеру 500 и печатает причину", async () => {
    const root = await temporaryProject();

    await writeSessionFile(root, "broken", "{ not json");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const running = await view(root);

    const reply = await fetch(`${running.url}api/recordings`);

    expect(reply.status).toBe(500);
    expect(vi.mocked(console.error).mock.calls.join("\n")).toContain(
      messages.view.requestFailed("").trim(),
    );
  });

  it("не меняет ни одного файла проекта", async () => {
    const root = await temporaryProject();

    await writeSessionFile(root, SESSION_ID, JSON.stringify(validSession(SESSION_ID)));
    await mkdir(path.join(root, "src"));
    await writeFile(path.join(root, "src", "index.js"), "export {};\n");
    const before = await snapshotOf(root);

    await visitFloor(root);

    expect(await snapshotOf(root)).toEqual(before);
  });
});
