// Previewing drafts of Codex sessions as recordings: the shared preview command with this adapter's
// agent and the source of its recordings.

import {
  previewDrafts as previewAgentDrafts,
  type AgentPreviewOptions,
  type KitError,
} from "@cyberzavod/adapter-kit";
import type { SessionRecord } from "@cyberzavod/core";
import { CODEX_AGENT } from "../generate/codex.ts";
import { CODEX_SOURCE } from "./publish.ts";

/** What to preview: the project, the language of the texts and the messages. */
export type PreviewDraftsOptions = AgentPreviewOptions;

/**
 * Builds the recordings of the project's drafts to look at, edited or not. A draft that cannot be
 * shown is skipped with a warning. Nothing is written and nothing is checked for leaks.
 * @param {PreviewDraftsOptions} options Project, language and messages.
 * @returns {Promise<SessionRecord[]>} Recordings in the order of the draft files and builds.
 * @throws {KitError} If there is no project.
 */
export function previewDrafts(options: PreviewDraftsOptions): Promise<SessionRecord[]> {
  return previewAgentDrafts({ ...options, agent: CODEX_AGENT, source: CODEX_SOURCE });
}
