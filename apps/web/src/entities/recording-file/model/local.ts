import type { SessionRecord } from "@cyberzavod/core";
import { ApiResponseError } from "@/shared/api/errors.ts";
import { objectAt, type JsonObject } from "@/shared/api/fields.ts";
import { parseRecordingFile } from "./parse.ts";

/**
 * What `cyberzavod view` serves: the project's recordings from the journal and the builds of its
 * session drafts, each list with the newest first.
 */
export interface LocalRecordings {
  readonly published: readonly SessionRecord[];
  readonly drafts: readonly SessionRecord[];
}

const PLACE = "ответ локального цеха";

function recordsAt(object: JsonObject, key: string): SessionRecord[] {
  const list = object[key];

  if (!Array.isArray(list)) throw new ApiResponseError(`${PLACE}: ${key} не список`);

  return list.map((raw: unknown) => parseRecordingFile(raw));
}

// ISO 8601 instants of one format sort as strings.
function newestFirst(records: readonly SessionRecord[]): SessionRecord[] {
  return records.toSorted((a, b) => b.timestamp.localeCompare(a.timestamp));
}

/**
 * Parses the local server's list of recordings and drafts; every record goes through the core's
 * `parseRecord`, as at site build time.
 * @param {unknown} raw Response body.
 * @returns {LocalRecordings} Recordings and drafts, the newest first.
 * @throws {ApiResponseError} If the body is not the expected object or a record is broken.
 */
export function parseLocalRecordings(raw: unknown): LocalRecordings {
  const object = objectAt(raw, PLACE);

  return {
    published: newestFirst(recordsAt(object, "published")),
    drafts: newestFirst(recordsAt(object, "drafts")),
  };
}
