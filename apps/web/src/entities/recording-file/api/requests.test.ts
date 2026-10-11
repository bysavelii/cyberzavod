import { describe, expect, it } from "vitest";
import type { SessionRecord } from "@cyberzavod/core";
import { ApiRequestError } from "@/shared/api/errors.ts";
import type { ApiRequest } from "@/shared/api/http.ts";
import { fetchLocalRecordings, fetchRecording } from "./requests.ts";

function validSession(): SessionRecord {
  return {
    version: 1,
    type: "session",
    id: "2026-10-07-aa4e0a7d",
    timestamp: "2026-10-07T08:00:00.000Z",
    projectId: "dupes",
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

function respondWith(body: string, status: number): { request: ApiRequest; paths: string[] } {
  const paths: string[] = [];
  const request: ApiRequest = (path) => {
    paths.push(path);

    return Promise.resolve(new Response(body, { status }));
  };

  return { request, paths };
}

describe("fetchRecording", () => {
  it("берёт запись из её файла", async () => {
    const { request, paths } = respondWith(JSON.stringify(validSession()), 200);

    const recording = await fetchRecording("2026-10-07-aa4e0a7d", request);

    expect({ id: recording.id, paths }).toEqual({
      id: "2026-10-07-aa4e0a7d",
      paths: ["/recordings/2026-10-07-aa4e0a7d.json"],
    });
  });

  it("бросает ошибку со статусом, когда файла нет", async () => {
    const { request } = respondWith("<!doctype html>", 404);

    const act = fetchRecording("missing", request);

    await expect(act).rejects.toBeInstanceOf(ApiRequestError);
  });
});

describe("fetchLocalRecordings", () => {
  it("спрашивает список у локального сервера и разбирает записи", async () => {
    const body = { published: [validSession()], drafts: [] };
    const { request, paths } = respondWith(JSON.stringify(body), 200);

    const recordings = await fetchLocalRecordings(request);

    expect({ ids: recordings.published.map(({ id }) => id), paths }).toEqual({
      ids: ["2026-10-07-aa4e0a7d"],
      paths: ["/api/recordings"],
    });
  });

  it("бросает ошибку со статусом, когда сервер не смог прочитать журнал", async () => {
    const { request } = respondWith(JSON.stringify({ error: "journal_broken" }), 500);

    const act = fetchLocalRecordings(request);

    await expect(act).rejects.toBeInstanceOf(ApiRequestError);
  });
});
