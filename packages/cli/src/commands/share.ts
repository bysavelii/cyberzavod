// `cyberzavod share` and `cyberzavod unshare`: sending a session recording to the personal gallery
// and removing it.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { isRecordId, parseRecord, type JournalRecord, type SessionRecord } from "@cyberzavod/core";
import { isNotFound, RECORD_COLLECTIONS } from "@cyberzavod/storage";
import { CommandError } from "../errors.ts";
import {
  isApiError,
  LIMIT_REACHED_CODE,
  type ApiError,
  type Me,
  type UploadedRecording,
} from "../sharing/api.ts";
import { withToken } from "../sharing/authorization.ts";
import type { CliMessages } from "../messages/cli-messages.ts";
import { recordingLink } from "../sharing/links.ts";
import type { Sharing } from "../sharing/services.ts";
import { requireProjectAt, type ProjectAt } from "./project.ts";

function requireRecordId(id: string): void {
  if (!isRecordId(id)) throw new CommandError((messages) => messages.errors.invalidRecordId(id));
}

async function readRecordText(project: ProjectAt, id: string): Promise<string> {
  const file = path.join(project.journal, RECORD_COLLECTIONS.session, `${id}.json`);

  try {
    return await readFile(file, "utf8");
  } catch (err) {
    if (!isNotFound(err)) throw err;

    const shown = path.relative(project.root, file);

    throw new CommandError((messages) => messages.errors.recordMissing({ id, file: shown }), {
      cause: err,
    });
  }
}

// The core checks the recording format: the server checks the envelope and the field lengths by
// the same limits of the core (`RECORD_LIMITS`), there is no second format description.
function parseSession(text: string, id: string): SessionRecord {
  const record = parseKnownRecord(text, id);

  if (record.type !== "session") {
    throw new CommandError((messages) =>
      messages.errors.recordNotSession({ id, type: record.type }),
    );
  }

  return record;
}

function parseKnownRecord(text: string, id: string): JournalRecord {
  try {
    return parseRecord(JSON.parse(text));
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);

    throw new CommandError((messages) => messages.errors.recordInvalid({ id, reason }), {
      cause: err,
    });
  }
}

function recordingLines(recordings: Me["recordings"]): string[] {
  return recordings.map((recording) => `  ${recording.id}  ${recording.title}`);
}

async function limitReachedError(sharing: Sharing, token: string): Promise<CommandError> {
  const me = await sharing.api.me(token);
  const { recordings, limit } = me;

  return new CommandError((messages) => {
    const lines = [
      messages.errors.limitReached,
      messages.share.galleryRecordings({ count: recordings.length, limit }),
      ...recordingLines(recordings),
      messages.share.freeUpSpace,
    ];

    return lines.join("\n");
  });
}

async function upload(
  sharing: Sharing,
  token: string,
  id: string,
  record: SessionRecord,
): Promise<UploadedRecording> {
  try {
    return await sharing.api.uploadRecording(token, id, record);
  } catch (err) {
    if (!isApiError(err, LIMIT_REACHED_CODE)) throw err;

    throw await limitReachedError(sharing, token);
  }
}

/** What to send: project, recording and message language. */
export interface ShareRecordingOptions {
  /** Directory inside the project. */
  directory: string;
  /** Session recording id. */
  id: string;
  /** Messages in the chosen language. */
  messages: CliMessages;
}

/**
 * Sends a session recording from the project journal to the author's personal gallery.
 * @param {Sharing} sharing Dependencies of the sharing commands.
 * @param {ShareRecordingOptions} options Project directory, recording id and messages.
 * @returns {Promise<void>} Done when the recording is sent and the link is printed.
 * @throws {CommandError} If the id is invalid, the recording is missing or fails validation, the
 *   human is not logged in, or the recording limit is reached.
 * @throws {ApiError} If the server rejected the recording.
 */
export async function shareRecording(
  sharing: Sharing,
  options: ShareRecordingOptions,
): Promise<void> {
  const { directory, id, messages } = options;

  requireRecordId(id);

  const project = await requireProjectAt(directory);
  const text = await readRecordText(project, id);
  const record = parseSession(text, id);

  const { uploaded, me } = await withToken(sharing, async (token) => ({
    uploaded: await upload(sharing, token, id, record),
    me: await sharing.api.me(token),
  }));
  const outcome = uploaded.isNew ? messages.share.sent(id) : messages.share.replaced(id);
  const link = recordingLink(sharing.siteUrl, uploaded.recording.slug);

  console.log(outcome);
  console.log(messages.share.link(link));

  if (!me.galleryPublic) {
    console.log(messages.share.galleryClosed);
    console.log(messages.share.openGalleryHint);
  }
}

/**
 * Removes a recording from the author's gallery.
 * @param {Sharing} sharing Dependencies of the sharing commands.
 * @param {string} id Recording id.
 * @param {CliMessages} messages Messages in the chosen language.
 * @returns {Promise<void>} Done when the server has removed the recording.
 * @throws {CommandError} If the id is invalid or the human is not logged in.
 * @throws {ApiError} If the gallery has no such recording.
 */
export async function unshareRecording(
  sharing: Sharing,
  id: string,
  messages: CliMessages,
): Promise<void> {
  requireRecordId(id);

  await withToken(sharing, (token) => sharing.api.deleteRecording(token, id));
  console.log(messages.share.removed(id));
}
