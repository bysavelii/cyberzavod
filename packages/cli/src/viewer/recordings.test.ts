import { describe, expect, it, vi } from "vitest";
import { JournalError } from "@cyberzavod/storage";
import { adapterShowing } from "../agents/fixtures.ts";
import { requireProjectAt } from "../commands/project.ts";
import { temporaryProject, validSession, writeSessionFile } from "../sharing/fixtures.ts";
import { localRecordingsOf } from "./recordings.ts";

async function projectWith(sessionIds: readonly string[]) {
  const root = await temporaryProject();

  for (const id of sessionIds) {
    await writeSessionFile(root, id, JSON.stringify(validSession(id)));
  }

  return requireProjectAt(root);
}

describe("localRecordingsOf", () => {
  it("отдаёт сессии журнала и сборки черновиков раздельно", async () => {
    const project = await projectWith(["2026-10-07-first"]);
    const adapter = adapterShowing([validSession("draft-build")]);

    const recordings = await localRecordingsOf(project, adapter, "ru");

    expect({
      published: recordings.published.map((record) => record.id),
      drafts: recordings.drafts.map((record) => record.id),
    }).toEqual({ published: ["2026-10-07-first"], drafts: ["draft-build"] });
  });

  it("прячет сборку черновика, чей id уже есть среди записей", async () => {
    const project = await projectWith(["2026-10-07-first"]);
    const adapter = adapterShowing([validSession("2026-10-07-first"), validSession("new-build")]);

    const recordings = await localRecordingsOf(project, adapter, "ru");

    expect(recordings.drafts.map((record) => record.id)).toEqual(["new-build"]);
  });

  it("при пустом журнале и без черновиков даёт два пустых списка", async () => {
    const project = await projectWith([]);

    const recordings = await localRecordingsOf(project, adapterShowing([]), "en");

    expect(recordings).toEqual({ published: [], drafts: [] });
  });

  it("просит у адаптера черновики проекта на языке цеха", async () => {
    const project = await projectWith([]);
    const adapter = adapterShowing([]);
    const previewDrafts = vi.spyOn(adapter, "previewDrafts");

    await localRecordingsOf(project, adapter, "en");

    expect(previewDrafts).toHaveBeenCalledWith({
      projectDirectory: project.root,
      language: "en",
    });
  });

  it("читает журнал заново при каждом вызове", async () => {
    const project = await projectWith([]);
    const adapter = adapterShowing([]);
    const before = await localRecordingsOf(project, adapter, "en");

    await writeSessionFile(project.root, "later", JSON.stringify(validSession("later")));
    const after = await localRecordingsOf(project, adapter, "en");

    expect({ before: before.published.length, after: after.published.length }).toEqual({
      before: 0,
      after: 1,
    });
  });

  it("при битой записи журнала бросает JournalError", async () => {
    const project = await projectWith([]);

    await writeSessionFile(project.root, "broken", "{ not json");

    const act = () => localRecordingsOf(project, adapterShowing([]), "en");

    await expect(act()).rejects.toBeInstanceOf(JournalError);
  });
});
