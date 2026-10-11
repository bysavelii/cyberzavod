// Previewing a draft as a recording before the editor has touched it: where the editor has not
// written the clean text yet, the human's original text stands in. The result is for the human's
// own screen only: it does not pass the leak check and is never written to the journal.

import {
  RECORD_LIMITS,
  type RecordError,
  type RecordSource,
  type SessionRecord,
} from "@cyberzavod/core";
import type { KitError } from "../errors.ts";
import {
  eventsOfBuild,
  recordOfEvents,
  type Draft,
  type DraftBuild,
  type DraftError,
  type DraftEvent,
  type DraftIntervention,
  type DraftMessage,
  type DraftPrompt,
} from "./draft.ts";

/** Fallback build header: what the editor has not filled in yet, taken from the project. */
export interface PreviewHeader {
  project: string;
  harness: string;
  workflow: string;
  /** Language of the texts, an ISO 639 code. */
  language: string;
  /** Title of a build that has none, from its id. */
  untitled: (buildId: string) => string;
}

const LINE_BREAK = /\r?\n/;

function firstLineOf(said: string): string {
  return (
    said
      .split(LINE_BREAK)
      .map((line) => line.trim())
      .find((line) => line !== "") ?? ""
  );
}

// Limits count code points, as the record check does; cutting units could split an emoji.
function truncated(text: string, limit: number): string {
  return text.length <= limit ? text : [...text].slice(0, limit).join("");
}

function isBlank(text: string): boolean {
  return text.trim() === "";
}

function previewPrompt(prompt: DraftPrompt): DraftEvent[] {
  if (prompt.joined === true || prompt.goal !== "") return [prompt];

  const goal = truncated(firstLineOf(prompt.said), RECORD_LIMITS.lineLength);

  return isBlank(goal) ? [] : [{ ...prompt, goal }];
}

function previewSaid<Event extends DraftMessage | DraftIntervention>(event: Event): Event[] {
  const line =
    event.line === "" ? truncated(firstLineOf(event.said), RECORD_LIMITS.lineLength) : event.line;
  const text =
    event.text === "" ? truncated(event.said.trim(), RECORD_LIMITS.textLength) : event.text;

  return isBlank(line) || isBlank(text) ? [] : [{ ...event, line, text }];
}

function previewEvent(event: DraftEvent): DraftEvent[] {
  switch (event.type) {
    case "draft_prompt":
      return previewPrompt(event);
    case "draft_message":
    case "draft_intervention":
      return previewSaid(event);
    default:
      return [event];
  }
}

// A merged prompt belongs to the prompt before it; when that one is dropped, there is nothing to
// merge into, and the recording would not build.
function withoutOrphanedJoins(events: readonly DraftEvent[]): DraftEvent[] {
  let hasPrompt = false;

  return events.filter((event) => {
    if (event.type === "draft_prompt" && event.joined === true) return hasPrompt;

    if (event.type === "draft_prompt" || event.type === "prompt") hasPrompt = true;

    return true;
  });
}

/**
 * Fills the texts the editor has not written from what was said: the first non-empty line goes
 * into the prompt's `goal` and the line of a message or an intervention, the trimmed whole text
 * into its `text`, cut to the record limits. Edited texts stay as they are; an event with nothing
 * said and nothing written is dropped, and so is a merged prompt left without the prompt before it.
 * Whose build an event belongs to is decided before, on the whole draft: dropping events must not
 * move the rest between builds.
 * @param {readonly DraftEvent[]} events Events of one build in any state of editing.
 * @returns {DraftEvent[]} New list; the argument is not changed.
 */
export function previewEvents(events: readonly DraftEvent[]): DraftEvent[] {
  return withoutOrphanedJoins(events.flatMap(previewEvent));
}

function withHeader(build: DraftBuild, header: PreviewHeader): DraftBuild {
  return {
    ...build,
    title: build.title === "" ? header.untitled(build.id) : build.title,
    project: build.project === "" ? header.project : build.project,
    harness: build.harness === "" ? header.harness : build.harness,
    workflow: build.workflow === "" ? header.workflow : build.workflow,
    language: build.language === "" ? header.language : build.language,
  };
}

/**
 * Turns one build of a draft into a recording to look at, whatever stage of editing the draft is
 * at: empty header fields come from `header`, empty texts from what was said. The header is filled
 * in every build before the events are shared out, so each event lands in one build's preview.
 * There is no leak check, so the recording must not be published or written to the journal.
 * @param {Draft} draft Draft in any state of editing.
 * @param {string} buildId Id of the build.
 * @param {PreviewHeader} header Fallback for the header fields the editor has not filled in.
 * @param {RecordSource} source Who made the build: the agent that ran the session.
 * @returns {SessionRecord} Recording that passed the core format check.
 * @throws {RecordError} If the build does not match the core format.
 * @throws {DraftError} If there is no such build.
 * @throws {KitError} If the build has no events.
 */
export function previewBuild(
  draft: Draft,
  buildId: string,
  header: PreviewHeader,
  source: RecordSource,
): SessionRecord {
  const headed = { ...draft, builds: draft.builds.map((build) => withHeader(build, header)) };
  const events = previewEvents(eventsOfBuild(headed, buildId));

  return recordOfEvents(headed, buildId, events, source);
}
