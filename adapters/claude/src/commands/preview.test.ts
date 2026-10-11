import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { KIT_MESSAGES } from "@cyberzavod/adapter-kit";
import { PROJECT_CONFIG_FILE } from "@cyberzavod/storage";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CLAUDE_AGENT } from "../generate/claude.ts";
import { previewDrafts } from "./preview.ts";
import { CLAUDE_SOURCE } from "./publish.ts";

const JOURNAL = ".cyberzavod/journal";
const BUILD_ID = "2026-10-04-744e7547";
const STARTED_AT = "2026-10-04T10:00:00.000Z";

let root: string;

async function connectProject(): Promise<void> {
  const config = { projectId: "lab", harness: "0.13.0", workflow: "default", journal: JOURNAL };

  await mkdir(path.join(root, path.dirname(PROJECT_CONFIG_FILE)), { recursive: true });
  await writeFile(path.join(root, PROJECT_CONFIG_FILE), JSON.stringify(config));
}

// A draft the editor has not touched: no title, no clean prompt.
async function saveUneditedDraft(agent: string): Promise<void> {
  const drafts = path.join(root, JOURNAL, "capture", agent, "drafts");
  const draft = {
    id: BUILD_ID,
    startedAt: STARTED_AT,
    builds: [
      { id: BUILD_ID, project: "", harness: "", workflow: "", title: "", language: "", runs: [] },
    ],
    events: [
      { t: 0, type: "draft_prompt", said: "Add a counter\nplease", goal: "", requirements: [] },
      { t: 1_000, type: "stage_enter", stage: "implementation" },
    ],
  };

  await mkdir(drafts, { recursive: true });
  await writeFile(path.join(drafts, `${BUILD_ID}.json`), JSON.stringify(draft));
}

describe("previewDrafts", () => {
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), "cyberzavod-claude-preview-"));
    await connectProject();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("собирает записи из черновиков своего агента с его источником", async () => {
    await saveUneditedDraft(CLAUDE_AGENT);

    const records = await previewDrafts({
      projectDirectory: root,
      language: "en",
      messages: KIT_MESSAGES.en,
    });

    expect(records).toMatchObject([
      {
        id: BUILD_ID,
        source: CLAUDE_SOURCE,
        data: {
          events: expect.arrayContaining([
            expect.objectContaining({ goal: "Add a counter" }),
          ]) as unknown[],
        },
      },
    ]);
  });

  it("не читает черновики чужого агента", async () => {
    await saveUneditedDraft("other-agent");

    const records = await previewDrafts({
      projectDirectory: root,
      language: "en",
      messages: KIT_MESSAGES.en,
    });

    expect(records).toEqual([]);
  });
});
