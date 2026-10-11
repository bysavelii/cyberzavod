// The CLI's requests to draft, publish and preview a session as the adapters' options: what the
// agents share, so each adapter file only picks its function.

import {
  KIT_MESSAGES,
  type AgentDraftOptions,
  type AgentPreviewOptions,
  type AgentPublishOptions,
} from "@cyberzavod/adapter-kit";
import type { DraftRequest, PreviewRequest, PublishRequest } from "./agent-adapter.ts";

/**
 * The options of an adapter's `draftSession` for the request.
 * @param {DraftRequest} request Project, raw log and language.
 * @returns {AgentDraftOptions} The options with the messages in the request's language.
 */
export function draftOptionsOf({
  projectDirectory,
  rawPath,
  language,
}: DraftRequest): AgentDraftOptions {
  return {
    projectDirectory,
    messages: KIT_MESSAGES[language],
    ...(rawPath === undefined ? {} : { rawPath }),
  };
}

/**
 * The options of an adapter's `publishSessions` for the request.
 * @param {PublishRequest} request Project, draft, build and language.
 * @returns {AgentPublishOptions} The options with the messages in the request's language.
 */
export function publishOptionsOf({
  projectDirectory,
  draftPath,
  buildId,
  language,
}: PublishRequest): AgentPublishOptions {
  return {
    projectDirectory,
    messages: KIT_MESSAGES[language],
    ...(draftPath === undefined ? {} : { draftPath }),
    ...(buildId === undefined ? {} : { buildId }),
  };
}

/**
 * The options of an adapter's `previewDrafts` for the request.
 * @param {PreviewRequest} request Project and language.
 * @returns {AgentPreviewOptions} The options with the messages in the request's language.
 */
export function previewOptionsOf({
  projectDirectory,
  language,
}: PreviewRequest): AgentPreviewOptions {
  return { projectDirectory, language, messages: KIT_MESSAGES[language] };
}
