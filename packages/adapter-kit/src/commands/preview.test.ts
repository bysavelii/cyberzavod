import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RecordSource } from "@cyberzavod/core";
import { PROJECT_CONFIG_FILE } from "@cyberzavod/storage";
import { FIRST_BUILD_ID, interleavedDraft, SECOND_BUILD_ID } from "../capture/draft.fixtures.ts";
import type { Draft } from "../capture/draft.ts";
import { KitError } from "../errors.ts";
import { KIT_MESSAGES } from "../messages/catalog.ts";
import { previewDrafts } from "./preview.ts";

const JOURNAL = ".cyberzavod/journal";
const AGENT = "codex";
const SOURCE: RecordSource = { type: "agent", provider: "openai", agent: AGENT };
const DRAFTS = path.join(JOURNAL, "capture", AGENT, "drafts");

let root: string;

async function connectProject(): Promise<void> {
  const config = { projectId: "lab", harness: "0.13.0", workflow: "default", journal: JOURNAL };

  await mkdir(path.join(root, path.dirname(PROJECT_CONFIG_FILE)), { recursive: true });
  await writeFile(path.join(root, PROJECT_CONFIG_FILE), JSON.stringify(config));
}

async function saveDraftText(name: string, text: string): Promise<void> {
  await mkdir(path.join(root, DRAFTS), { recursive: true });
  await writeFile(path.join(root, DRAFTS, name), text);
}

async function saveDraft(draft: Draft): Promise<void> {
  await saveDraftText(`${draft.id}.json`, JSON.stringify(draft));
}

function uneditedDraft(): Draft {
  const draft = interleavedDraft();

  return {
    ...draft,
    builds: draft.builds.map((build) => ({
      ...build,
      title: "",
      project: "",
      harness: "",
      language: "",
    })),
  };
}

function preview(messages = KIT_MESSAGES.en) {
  return previewDrafts({
    projectDirectory: root,
    language: "en",
    messages,
    agent: AGENT,
    source: SOURCE,
  });
}

async function filesOf(directory: string): Promise<string[]> {
  const names = await readdir(directory, { recursive: true });

  return names.sort();
}

describe("previewDrafts", () => {
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "cyberzavod-preview-"));
    await connectProject();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await rm(root, { recursive: true, force: true });
  });

  it("отдаёт пустой список, когда у агента нет каталога черновиков", async () => {
    const records = await preview();

    expect(records).toEqual([]);
  });

  it("собирает запись из каждой сборки каждого черновика", async () => {
    await saveDraft(interleavedDraft());

    const records = await preview();

    expect(records.map(({ id }) => id)).toEqual([FIRST_BUILD_ID, SECOND_BUILD_ID]);
  });

  it("подставляет в пустую шапку проект и версии из конфига и заголовок из каталога сообщений", async () => {
    await saveDraft(uneditedDraft());

    const [record] = await preview(KIT_MESSAGES.ru);

    expect(record).toMatchObject({
      projectId: "lab",
      data: { title: `Черновик ${FIRST_BUILD_ID}`, harness: "0.13.0", language: "en" },
    });
  });

  it("предупреждает о битом черновике и показывает остальные", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await saveDraftText("a-broken.json", "{not json");
    await saveDraft(interleavedDraft());

    const records = await preview();

    expect(records).toHaveLength(2);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("a-broken.json"));
  });

  it("предупреждает о сборке без событий и показывает остальные сборки черновика", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const full = interleavedDraft();
    const draft = {
      ...full,
      builds: full.builds.map((build, index) => ({
        ...build,
        id: index === 0 ? build.id : "empty-build",
        runs: [],
      })),
      events: full.events.filter((event) => !("build" in event)),
    };

    await saveDraft(draft);

    const records = await preview();

    expect(records.map(({ id }) => id)).toEqual([FIRST_BUILD_ID]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("build empty-build"));
  });

  it("не пишет ни в проект, ни в журнал", async () => {
    await saveDraft(uneditedDraft());

    const before = await filesOf(root);
    const contents = await readFile(path.join(root, DRAFTS, `${FIRST_BUILD_ID}.json`), "utf8");

    await preview();

    expect(await filesOf(root)).toEqual(before);
    expect(await readFile(path.join(root, DRAFTS, `${FIRST_BUILD_ID}.json`), "utf8")).toBe(
      contents,
    );
  });

  it("бросает ошибку кита вне проекта", async () => {
    await rm(path.join(root, ".cyberzavod"), { recursive: true });

    const act = () => preview();

    await expect(act()).rejects.toBeInstanceOf(KitError);
  });
});
