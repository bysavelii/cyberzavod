import { describe, expect, it } from "vitest";
import type { SessionRecord } from "@cyberzavod/core";
import { groupsOf, isChosen, type ListedRecording } from "./groups.ts";

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

describe("groupsOf", () => {
  it("ставит черновики перед записями и нумерует места в каждой группе", () => {
    const recordings = {
      published: [sessionOf("p1"), sessionOf("p2")],
      drafts: [sessionOf("d1")],
    };

    const groups = groupsOf(recordings);

    expect(
      groups.map(({ kind, recordings: listed }) => [
        kind,
        listed.map(({ place, record }) => [place.index, record.id]),
      ]),
    ).toEqual([
      ["draft", [[0, "d1"]]],
      [
        "published",
        [
          [0, "p1"],
          [1, "p2"],
        ],
      ],
    ]);
  });

  it("не оставляет пустую группу", () => {
    const groups = groupsOf({ published: [sessionOf("p1")], drafts: [] });

    expect(groups.map(({ kind }) => kind)).toEqual(["published"]);
  });

  it("не оставляет групп, когда записей нет", () => {
    expect(groupsOf({ published: [], drafts: [] })).toEqual([]);
  });
});

describe("isChosen", () => {
  const listed: ListedRecording = { place: { kind: "draft", index: 1 }, record: sessionOf("d2") };

  it.each([
    [{ kind: "draft", index: 1 }, true],
    [{ kind: "draft", index: 0 }, false],
    [{ kind: "published", index: 1 }, false],
    [undefined, false],
  ] as const)("сверяет место %j с выбранным", (chosen, expected) => {
    expect(isChosen(listed, chosen)).toBe(expected);
  });
});
