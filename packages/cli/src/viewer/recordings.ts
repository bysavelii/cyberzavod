// What the factory floor lists: the sessions of the project journal and the builds of the agents'
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
 * @param {readonly AgentAdapter[]} adapters The project's agents: each knows where its drafts are.
 * @param {InterfaceLanguage} language Language of the builds' fallback titles.
 * @returns {Promise<LocalRecordings>} Sessions from `sessions/` and builds of all the agents' drafts.
 * @throws {JournalError} If a record file in the journal is corrupt.
 */
export async function localRecordingsOf(
  project: ProjectAt,
  adapters: readonly AgentAdapter[],
  language: InterfaceLanguage,
): Promise<LocalRecordings> {
  const records = await new DirectoryRecordStore(project.journal).list();
  const published = records.filter(isSession);
  const request = { projectDirectory: project.root, language };
  const buildsByAgent = await Promise.all(
    adapters.map((adapter) => adapter.previewDrafts(request)),
  );
  const builds = buildsByAgent.flat();
  const publishedIds = new Set(published.map((record) => record.id));
  const drafts = builds.filter((build) => !publishedIds.has(build.id));

  return { published, drafts };
}
