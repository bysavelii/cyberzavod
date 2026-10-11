import { parseRecord, type JournalRecord, type SessionRecord } from "@cyberzavod/core";
import { ApiResponseError } from "@/shared/api/errors.ts";
import { arrayAt, booleanAt, countAt, objectAt, stringAt } from "@/shared/api/fields.ts";
import type { Gallery, OwnGallery, RecordingSummary, SharedRecording } from "./gallery.ts";

function summaryOf(raw: unknown): RecordingSummary {
  const place = "запись галереи";
  const summary = objectAt(raw, place);

  return {
    id: stringAt(summary, "id", place),
    slug: stringAt(summary, "slug", place),
    projectId: stringAt(summary, "projectId", place),
    title: stringAt(summary, "title", place),
    language: stringAt(summary, "language", place),
    startedAt: stringAt(summary, "startedAt", place),
    uploadedAt: stringAt(summary, "uploadedAt", place),
  };
}

// Only the core checks the recording format: the site has no second description of the format.
function checkedRecord(raw: unknown): JournalRecord {
  try {
    return parseRecord(raw);
  } catch (err) {
    throw new ApiResponseError("запись из галереи не прошла проверку", { cause: err });
  }
}

function sessionOf(raw: unknown): SessionRecord {
  const record = checkedRecord(raw);

  if (record.type !== "session") {
    throw new ApiResponseError(`запись из галереи — ${record.type}, а не сессия`);
  }

  return record;
}

/**
 * Parses the `GET /api/galleries/{login}` response.
 * @param {unknown} raw Response body.
 * @returns {Gallery} The author's gallery with recordings in API order, newest first.
 * @throws {ApiResponseError} If the response has the wrong shape.
 */
export function parseGallery(raw: unknown): Gallery {
  const place = "ответ /api/galleries/{login}";
  const gallery = objectAt(raw, place);

  return {
    login: stringAt(gallery, "login", place),
    recordings: arrayAt(gallery, "recordings", place).map(summaryOf),
  };
}

/**
 * Parses the `GET /api/recordings/{slug}` response: the recording goes through the core's
 * `parseRecord`, like journal recordings at site build time.
 * @param {unknown} raw Response body.
 * @returns {SharedRecording} The session, its author and whether their gallery is public.
 * @throws {ApiResponseError} If the response has the wrong shape or the recording is broken or not
 *   a session.
 */
export function parseSharedRecording(raw: unknown): SharedRecording {
  const place = "ответ /api/recordings/{slug}";
  const response = objectAt(raw, place);

  return {
    owner: stringAt(response, "owner", place),
    galleryPublic: booleanAt(response, "galleryPublic", place),
    record: sessionOf(response["record"]),
  };
}

/**
 * Parses the `GET /api/me` response: the signed-in author's own gallery.
 * @param {unknown} raw Response body.
 * @returns {OwnGallery} The gallery with recordings in API order, newest first.
 * @throws {ApiResponseError} If the response has the wrong shape.
 */
export function parseOwnGallery(raw: unknown): OwnGallery {
  const place = "ответ /api/me";
  const gallery = objectAt(raw, place);

  return {
    login: stringAt(gallery, "login", place),
    galleryPublic: booleanAt(gallery, "galleryPublic", place),
    limit: countAt(gallery, "limit", place),
    recordings: arrayAt(gallery, "recordings", place).map(summaryOf),
  };
}
