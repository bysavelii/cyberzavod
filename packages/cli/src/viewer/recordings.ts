// What the factory floor lists: the sessions of the project journal and the builds of the agent's
// drafts.

import type { InterfaceLanguage, JournalRecord, SessionRecord } from "@cyberzavod/core";
import { DirectoryRecordStore, type JournalError } from "@cyberzavod/storage";
import type { AgentAdapter } from "../agents/agent-adapter.ts";
import type { ProjectAt } from "../commands/project.ts";

/** Recordings of the project, and draft builds that are not recordings yet. */
export interface LocalRecordings {
  published: SessionRecord[];
  drafts: SessionRecord[];
}

function isSession(record: JournalRecord): record is SessionRecord {
  return record.type === "session";
}

/**
 * Reads the journal and the drafts afresh. A build whose id is already a recording is left out of
 * the drafts: it would be on the list twice.
 * @param {ProjectAt} project The connected project.
 * @param {AgentAdapter} adapter The project's agent: it knows where the drafts are.
 * @param {InterfaceLanguage} language Language of the builds' fallback titles.
 * @returns {Promise<LocalRecordings>} Sessions from `sessions/` and builds of the drafts.
 * @throws {JournalError} If a record file in the journal is corrupt.
 */
export async function localRecordingsOf(
  project: ProjectAt,
  adapter: AgentAdapter,
  language: InterfaceLanguage,
): Promise<LocalRecordings> {
  const records = await new DirectoryRecordStore(project.journal).list();
  const published = records.filter(isSession);
  const builds = await adapter.previewDrafts({ projectDirectory: project.root, language });
  const publishedIds = new Set(published.map((record) => record.id));
  const drafts = builds.filter((build) => !publishedIds.has(build.id));

  return { published, drafts };
}
