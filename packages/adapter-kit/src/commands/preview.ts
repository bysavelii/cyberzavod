// Previewing drafts as recordings for the human's own screen: every build of every draft in the
// agent's `capture/<agent>/drafts/`, as it stands, edited or not. Nothing is written anywhere.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { RecordError, type RecordSource, type SessionRecord } from "@cyberzavod/core";
import { isNotFound } from "@cyberzavod/storage";
import { DraftError, parseDraft, type Draft } from "../capture/draft.ts";
import { previewBuild, type PreviewHeader } from "../capture/preview.ts";
import { KitError } from "../errors.ts";
import type { KitMessages } from "../messages/kit-messages.ts";
import { captureDirectories, requireProject } from "../paths.ts";

const DRAFT_EXTENSION = ".json";

/** What to preview: the project and the language of the texts. */
export interface PreviewDraftsOptions {
  /** Directory inside the project. */
  projectDirectory: string;
  /** Language of the builds that have none yet, an ISO 639 code. */
  language: string;
  /** Messages in the chosen language. */
  messages: KitMessages;
  /** The agent whose session it is: its drafts are in `capture/<agent>/drafts/`. */
  agent: string;
  /** Who made the builds: the agent that ran the session. */
  source: RecordSource;
}

/** What an adapter's preview command takes: the options without the agent and the source. */
export type AgentPreviewOptions = Omit<PreviewDraftsOptions, "agent" | "source">;

type PreviewProblem = DraftError | RecordError | KitError;

function isPreviewProblem(err: unknown): err is PreviewProblem {
  return err instanceof DraftError || err instanceof RecordError || err instanceof KitError;
}

// Format errors (`DraftError`, `RecordError`) are not translated: their text is a file diagnostic.
function problemText(err: PreviewProblem, messages: KitMessages): string {
  return err instanceof KitError ? err.describe(messages) : err.message;
}

// No directory yet means no drafts; other errors are not swallowed.
async function draftFilesIn(directory: string): Promise<string[]> {
  try {
    const names = await readdir(directory);

    return names.filter((name) => name.endsWith(DRAFT_EXTENSION)).sort();
  } catch (err) {
    if (isNotFound(err)) return [];

    throw err;
  }
}

async function readDraft(file: string): Promise<Draft> {
  const draftJson: unknown = JSON.parse(await readFile(file, "utf8"));

  return parseDraft(draftJson);
}

// What every build of every draft is built with.
interface PreviewContext {
  header: PreviewHeader;
  source: RecordSource;
  messages: KitMessages;
}

function recordOrWarning(
  draft: Draft,
  buildId: string,
  shown: string,
  context: PreviewContext,
): SessionRecord | undefined {
  const { header, source, messages } = context;

  try {
    return previewBuild(draft, buildId, header, source);
  } catch (err) {
    if (!isPreviewProblem(err)) throw err;

    const reason = problemText(err, messages);

    console.warn(messages.preview.skipped({ file: shown, buildId, reason }));

    return undefined;
  }
}

function recordsOf(draft: Draft, shown: string, context: PreviewContext): SessionRecord[] {
  const records = draft.builds.map(({ id }) => recordOrWarning(draft, id, shown, context));

  return records.filter((record) => record !== undefined);
}

async function recordsOfFile(
  file: string,
  shown: string,
  context: PreviewContext,
): Promise<SessionRecord[]> {
  try {
    return recordsOf(await readDraft(file), shown, context);
  } catch (err) {
    if (!(err instanceof DraftError || err instanceof SyntaxError)) throw err;

    console.warn(context.messages.preview.skipped({ file: shown, reason: err.message }));

    return [];
  }
}

/**
 * Builds the recordings of all drafts of the project's agent for the human to look at. A draft or a
 * build that cannot be shown is skipped with a warning; the rest are returned. Texts the editor has
 * not written come from what was said, and nothing is checked for leaks, so the result stays on the
 * human's machine. Nothing is written.
 * @param {PreviewDraftsOptions} options Project, language, messages, agent and source.
 * @returns {Promise<SessionRecord[]>} Recordings in the order of the draft files and builds; none
 *   if the agent has no drafts.
 * @throws {KitError} If there is no project.
 */
export async function previewDrafts(options: PreviewDraftsOptions): Promise<SessionRecord[]> {
  const project = await requireProject(options.projectDirectory);
  const { harness, workflow, projectId } = project.config;
  const { source, messages } = options;
  const header = {
    project: projectId,
    harness,
    workflow,
    language: options.language,
    untitled: (buildId: string) => messages.preview.untitled(buildId),
  };
  const context = { header, source, messages };
  const directory = captureDirectories(project.journal, options.agent).drafts;
  const records: SessionRecord[] = [];

  for (const name of await draftFilesIn(directory)) {
    const file = path.join(directory, name);
    const shown = path.relative(project.root, file);

    records.push(...(await recordsOfFile(file, shown, context)));
  }

  return records;
}
