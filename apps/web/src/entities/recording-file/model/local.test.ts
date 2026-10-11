import { describe, expect, it } from "vitest";
import type { SessionRecord } from "@cyberzavod/core";
import { ApiResponseError } from "@/shared/api/errors.ts";
import { parseLocalRecordings } from "./local.ts";

function sessionOf(id: string, timestamp: string): SessionRecord {
  return {
    version: 1,
    type: "session",
    id,
    timestamp,
    projectId: "lab",
    source: { type: "manual" },
    data: {
      title: "Каркас",
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

const OLD = "2026-10-01T08:00:00.000Z";
const NEW = "2026-10-07T08:00:00.000Z";

describe("parseLocalRecordings", () => {
  it("раскладывает записи и черновики по спискам", () => {
    const raw = { published: [sessionOf("a", OLD)], drafts: [sessionOf("b", NEW)] };

    const { published, drafts } = parseLocalRecordings(raw);

    expect([published.map(({ id }) => id), drafts.map(({ id }) => id)]).toEqual([["a"], ["b"]]);
  });

  it("ставит новые записи первыми", () => {
    const raw = {
      published: [sessionOf("old", OLD), sessionOf("new", NEW)],
      drafts: [sessionOf("older", OLD), sessionOf("newer", NEW)],
    };

    const { published, drafts } = parseLocalRecordings(raw);

    expect([published.map(({ id }) => id), drafts.map(({ id }) => id)]).toEqual([
      ["new", "old"],
      ["newer", "older"],
    ]);
  });

  it("принимает пустые списки", () => {
    const raw = { published: [], drafts: [] };

    expect(parseLocalRecordings(raw)).toEqual({ published: [], drafts: [] });
  });

  it("отклоняет ответ не того вида", () => {
    const act = () => parseLocalRecordings({ published: [] });

    expect(act).toThrow(ApiResponseError);
  });

  it("отклоняет ответ, который не объект", () => {
    const act = () => parseLocalRecordings([]);

    expect(act).toThrow(ApiResponseError);
  });

  it("отклоняет запись, не прошедшую проверку ядра", () => {
    const raw = { published: [], drafts: [{ ...sessionOf("b", NEW), version: 99 }] };

    const act = () => parseLocalRecordings(raw);

    expect(act).toThrow(ApiResponseError);
  });
});
