import type { SessionRecord } from "@cyberzavod/core";
import { getJson, type ApiRequest } from "@/shared/api/http.ts";
import { parseLocalRecordings, type LocalRecordings } from "../model/local.ts";
import { parseRecordingFile } from "../model/parse.ts";
import { recordingFileUrl } from "../model/url.ts";

/**
 * Requests a full site recording from its file.
 * @param {string} id Recording id.
 * @param {ApiRequest} [request] Request; the browser `fetch` by default.
 * @returns {Promise<SessionRecord>} A recording that passed the core's check.
 * @throws {Error} `ApiRequestError` if the file is missing or the server responded with an error;
 *   `ApiResponseError` if the file is not JSON or the recording is broken or not a session.
 */
export async function fetchRecording(id: string, request?: ApiRequest): Promise<SessionRecord> {
  const body = await getJson(recordingFileUrl(id), request);

  return parseRecordingFile(body);
}

/** Address of the local server's list of recordings and drafts. */
const LOCAL_RECORDINGS_PATH = "/api/recordings";

/**
 * Requests the recordings and drafts of the project that `cyberzavod view` serves.
 * @param {ApiRequest} [request] Request; the browser `fetch` by default.
 * @returns {Promise<LocalRecordings>} Recordings that passed the core's check.
 * @throws {Error} `ApiRequestError` if the server responded with an error; `ApiResponseError` if
 *   the answer is not JSON of the expected shape or a record is broken.
 */
export async function fetchLocalRecordings(request?: ApiRequest): Promise<LocalRecordings> {
  const body = await getJson(LOCAL_RECORDINGS_PATH, request);

  return parseLocalRecordings(body);
}
