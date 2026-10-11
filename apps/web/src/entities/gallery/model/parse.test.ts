import { describe, expect, it } from "vitest";
import type { SessionRecord } from "@cyberzavod/core";
import { ApiResponseError } from "@/shared/api/errors.ts";
import { parseGallery, parseOwnGallery, parseSharedRecording } from "./parse.ts";

function validSession(): SessionRecord {
  return {
    version: 1,
    type: "session",
    id: "2026-10-05-4365c610",
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

function validSummary(): Record<string, unknown> {
  return {
    id: "2026-10-05-4365c610",
    slug: "k3f9x2m1q8zt",
    projectId: "lab",
    title: "Лаборатория",
    language: "ru",
    startedAt: "2026-10-05T08:00:00.000Z",
    uploadedAt: "2026-10-06T10:00:00Z",
  };
}

function withoutField(object: Record<string, unknown>, key: string): Record<string, unknown> {
  const fields = Object.entries(object).filter(([name]) => name !== key);

  return Object.fromEntries(fields);
}

describe("parseGallery", () => {
  it("читает галерею автора с записями", () => {
    const raw = { login: "alice", recordings: [validSummary()] };

    const gallery = parseGallery(raw);

    expect(gallery).toEqual({ login: "alice", recordings: [validSummary()] });
  });

  it("отклоняет запись без slug", () => {
    const withoutSlug = withoutField(validSummary(), "slug");

    const act = () => parseGallery({ login: "alice", recordings: [withoutSlug] });

    expect(act).toThrow("запись галереи: slug не строка");
  });
});

describe("parseSharedRecording", () => {
  it("читает запись, автора и открытость галереи", () => {
    const raw = { owner: "alice", galleryPublic: true, record: validSession() };

    const shared = parseSharedRecording(raw);

    expect(shared).toEqual({ owner: "alice", galleryPublic: true, record: validSession() });
  });

  it("отклоняет запись, которую не принимает ядро", () => {
    const broken = { ...validSession(), data: { ...validSession().data, events: "нет" } };

    const act = () =>
      parseSharedRecording({ owner: "alice", galleryPublic: false, record: broken });

    expect(act).toThrow(ApiResponseError);
  });

  it("отклоняет запись, которая не сессия", () => {
    const note = {
      version: 1,
      type: "note",
      id: "n-1",
      timestamp: "2026-10-05T08:00:00.000Z",
      projectId: "lab",
      source: { type: "manual" },
      data: { text: "заметка" },
    };

    const act = () => parseSharedRecording({ owner: "alice", galleryPublic: false, record: note });

    expect(act).toThrow("запись из галереи — note, а не сессия");
  });
});

describe("parseOwnGallery", () => {
  it("читает свою галерею с пределом и записями", () => {
    const raw = { login: "alice", galleryPublic: false, limit: 5, recordings: [validSummary()] };

    const gallery = parseOwnGallery(raw);

    expect(gallery).toEqual({
      login: "alice",
      galleryPublic: false,
      limit: 5,
      recordings: [validSummary()],
    });
  });

  it("отклоняет ответ без предела", () => {
    const raw = { login: "alice", galleryPublic: true, recordings: [] };

    const act = () => parseOwnGallery(raw);

    expect(act).toThrow(ApiResponseError);
  });
});
