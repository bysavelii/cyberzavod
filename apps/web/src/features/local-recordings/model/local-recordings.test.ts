import { describe, expect, it, vi } from "vitest";
import type { SessionRecord } from "@cyberzavod/core";
import type { LocalRecordings } from "@/entities/recording-file";
import { createLocalRecordingsModel } from "./local-recordings.ts";

function sessionOf(id: string): SessionRecord {
  return {
    version: 1,
    type: "session",
    id,
    timestamp: "2026-10-05T08:00:00.000Z",
    projectId: "lab",
    source: { type: "manual" },
    data: {
      title: "Лаборатория",
      language: "ru",
      workflow: "default",
      harness: "0.0.0",
      events: [
        { t: 0, type: "build_start" },
        { t: 1, type: "build_end", ok: true },
      ],
    },
  };
}

function recordingsOf(published: string[], drafts: string[]): LocalRecordings {
  return { published: published.map(sessionOf), drafts: drafts.map(sessionOf) };
}

function idOf(record: SessionRecord | undefined): string | undefined {
  return record?.id;
}

async function openedModel(recordings: LocalRecordings) {
  const model = createLocalRecordingsModel(() => Promise.resolve(recordings));

  await model.open();

  return model;
}

describe("createLocalRecordingsModel", () => {
  it("начинает с загрузки и пока ничего не проигрывает", () => {
    const model = createLocalRecordingsModel(() => new Promise<LocalRecordings>(() => undefined));

    expect([model.$recordings.get(), model.$chosenRecording.get()]).toEqual([
      { status: "loading" },
      undefined,
    ]);
  });

  it("по умолчанию проигрывает первый черновик", async () => {
    const model = await openedModel(recordingsOf(["p1"], ["d1", "d2"]));

    expect(idOf(model.$chosenRecording.get())).toBe("d1");
  });

  it("без черновиков проигрывает первую запись", async () => {
    const model = await openedModel(recordingsOf(["p1", "p2"], []));

    expect(idOf(model.$chosenRecording.get())).toBe("p1");
  });

  it("без записей и черновиков проигрывать нечего", async () => {
    const model = await openedModel(recordingsOf([], []));

    expect(model.$chosenRecording.get()).toBeUndefined();
  });

  it("ставит на цех выбранную запись", async () => {
    const model = await openedModel(recordingsOf(["p1", "p2"], ["d1"]));

    model.choose("published", 1);

    expect([idOf(model.$chosenRecording.get()), model.$chosenPlace.get()]).toEqual([
      "p2",
      { kind: "published", index: 1 },
    ]);
  });

  it("возвращается к выбору по умолчанию, если выбранной записи в списке нет", async () => {
    const model = await openedModel(recordingsOf(["p1"], ["d1"]));

    model.choose("published", 5);

    expect(idOf(model.$chosenRecording.get())).toBe("d1");
  });

  it("шлёт один запрос, когда список открывают цех и журнал", async () => {
    const fetchRecordings = vi.fn(() => Promise.resolve(recordingsOf([], [])));
    const model = createLocalRecordingsModel(fetchRecordings);

    await Promise.all([model.open(), model.open()]);

    expect(fetchRecordings).toHaveBeenCalledTimes(1);
  });

  it("называет сбой запроса сбоем и ничего не проигрывает", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const model = createLocalRecordingsModel(() => Promise.reject(new TypeError("нет сети")));

    await model.open();

    expect([model.$recordings.get(), model.$chosenRecording.get()]).toEqual([
      { status: "failed" },
      undefined,
    ]);
  });
});
