// Session builds: which draft events belong to which recording and how build time is counted.
// A build is a set of events, not a time span: tasks in one session interleave, and commands
// of the main session belong to their project's build by the `project` tag.

import type { Draft, DraftBuild, DraftEvent, DraftRun } from "./draft.ts";

/**
 * The longest pause in a build recording: a gap in which no station of the build is working
 * and it has no events is shrunk to it. So the duration includes neither waiting for the
 * human nor time when the conductor is busy with another task.
 */
export const IDLE_GAP_MS = 2 * 60 * 1000;

function runOf(event: DraftEvent): string | undefined {
  return event.type === "draft_prompt" || event.type === "draft_intervention"
    ? undefined
    : event.run;
}

// Project of a main session event: `cyberzavod draft` sets it from the command's directory.
function projectOfEvent(event: DraftEvent): string | undefined {
  switch (event.type) {
    case "draft_prompt":
    case "draft_message":
    case "draft_intervention":
    case "draft_run":
      return undefined;
    default:
      return event.project;
  }
}

// The build an event names itself: a prompt, a message and an intervention by the `build` field
// (for a message it overrides the run), station events by their run. Other events do not name a
// build.
function namedBuild(
  event: DraftEvent,
  buildOfRun: ReadonlyMap<string, string>,
  firstBuild: string,
): string | undefined {
  const canNameBuild =
    event.type === "draft_prompt" ||
    event.type === "draft_message" ||
    event.type === "draft_intervention";

  if (canNameBuild && event.build !== undefined) return event.build;

  const run = runOf(event);

  return run === undefined ? undefined : (buildOfRun.get(run) ?? firstBuild);
}

function firstBuildsOfProjects(builds: readonly DraftBuild[]): Map<string, string> {
  const firstBuilds = new Map<string, string>();

  for (const { id, project } of builds) {
    if (project !== "" && !firstBuilds.has(project)) firstBuilds.set(project, id);
  }

  return firstBuilds;
}

/**
 * Determines the build of each draft event, applying the rules in order:
 * 1. a prompt, a message and an intervention: the build from their `build` field;
 * 2. a station event: the build whose `runs` list names the run, and one named nowhere goes to the
 *    first;
 * 3. a main session event with a `project` tag: the build of that project the closest preceding
 *    event belonged to, or, if there was none, the project's first build in order;
 *    the rule does not apply to a project without builds;
 * 4. other events: the build of the current event, the last one whose build was set by rules
 *    1 and 2, and before the first such event, the first build.
 * An event assigned by project does not change the current build: a reply to the human stays in the
 * task of its prompt. Guessing the task by `#N` is not needed: issue numbers repeat across
 * projects.
 * @param {Draft} draft Draft with at least one build.
 * @returns {string[]} Build `id` for each draft event, in the same order.
 * @throws {Error} If the draft has no builds: `parseDraft` rejects such a draft.
 */
export function eventBuilds(draft: Draft): string[] {
  const firstBuild = draft.builds[0]?.id;

  if (firstBuild === undefined) throw new Error("draft has no builds");

  const runBuilds = draft.builds.flatMap(({ id, runs }) =>
    runs.map((run): [string, string] => [run, id]),
  );
  const buildOfRun = new Map(runBuilds);
  const projectOfBuild = new Map(draft.builds.map(({ id, project }) => [id, project]));
  const firstBuildOfProject = firstBuildsOfProjects(draft.builds);
  const lastBuildOfProject = new Map<string, string>();
  let current = firstBuild;

  return draft.events.map((event) => {
    const named = namedBuild(event, buildOfRun, firstBuild);

    if (named !== undefined) current = named;

    const project = projectOfEvent(event);
    const byProject =
      project === undefined
        ? undefined
        : (lastBuildOfProject.get(project) ?? firstBuildOfProject.get(project));
    const owner = named ?? byProject ?? current;
    const ownerProject = projectOfBuild.get(owner);

    if (ownerProject !== undefined && ownerProject !== "") {
      lastBuildOfProject.set(ownerProject, owner);
    }

    return owner;
  });
}

/**
 * Finds station runs not named in any build: they go to the first build.
 * @param {Draft} draft Recording draft.
 * @returns {DraftRun[]} The first window of each such run, in journal order: after
 *   `SendMessage` one run has several windows.
 */
export function unassignedRuns(draft: Draft): DraftRun[] {
  const assigned = new Set(draft.builds.flatMap(({ runs }) => runs));
  const seen = new Set<string>();

  return draft.events.flatMap((event) => {
    if (event.type !== "draft_run" || assigned.has(event.run) || seen.has(event.run)) return [];

    seen.add(event.run);

    return [event];
  });
}

/**
 * Finds projects that have events in the draft but no build: those events go to the build
 * by time, and the editor should create a build for the project.
 * @param {Draft} draft Recording draft.
 * @returns {string[]} Projects from `project` tags without a build, without repeats, in order of
 *   appearance.
 */
export function projectsWithoutBuild(draft: Draft): string[] {
  const withBuild = new Set(draft.builds.map(({ project }) => project));
  const missing = new Set<string>();

  for (const event of draft.events) {
    const project = projectOfEvent(event);

    if (project !== undefined && !withBuild.has(project)) missing.add(project);
  }

  return [...missing];
}

/** Build time without long pauses: from the first event to the end of its work. */
export interface BuildTimeline {
  /** Time of the build's first event in the draft, milliseconds from the start of the log. */
  start: number;
  /** Build duration in the recording, milliseconds. */
  end: number;
  /** Converts a draft event time to recording time. */
  at: (t: number) => number;
}

interface Span {
  from: number;
  to: number;
}

// Tokens, build start and build end do not define time: publishing sets them, and session tokens
// sit in the draft at the nearest event, not where something happened.
function isTimed(event: DraftEvent): boolean {
  return event.type !== "usage" && event.type !== "build_start" && event.type !== "build_end";
}

// Busy time of a build: a station run window and the moment of each event.
function spanOf(event: DraftEvent): Span {
  return event.type === "draft_run"
    ? { from: event.t, to: Math.max(event.t, event.until) }
    : { from: event.t, to: event.t };
}

function mergedSpans(events: readonly DraftEvent[]): Span[] {
  const merged: Span[] = [];
  const spans = events.filter(isTimed).map(spanOf);

  for (const span of spans.sort((a, b) => a.from - b.from)) {
    const last = merged.at(-1);

    if (last !== undefined && span.from <= last.to) last.to = Math.max(last.to, span.to);
    else merged.push({ ...span });
  }

  return merged;
}

/**
 * Counts build time: pauses longer than `IDLE_GAP_MS`, when no station of the build is working
 * and it has no events, are shrunk to it. Station work without events inside is not a pause.
 * The build ends at its last event or at the end of its last run window. The conversion `at` does
 * not go back: a moment inside a shrunk pause is converted as the end of the part that was kept.
 * @param {readonly DraftEvent[]} events Events of one build, in order.
 * @returns {BuildTimeline | undefined} Build time, or undefined if it has no events
 *   with a time (tokens, start and end do not count).
 */
export function buildTimeline(events: readonly DraftEvent[]): BuildTimeline | undefined {
  const spans = mergedSpans(events);
  const first = spans[0];
  const last = spans.at(-1);

  if (first === undefined || last === undefined) return undefined;

  const cuts = spans.slice(1).flatMap((span, index) => {
    const gap = span.from - (spans[index]?.to ?? span.from);

    return gap > IDLE_GAP_MS ? [{ before: span.from, cut: gap - IDLE_GAP_MS }] : [];
  });
  const cutBefore = (t: number) =>
    cuts.filter(({ before }) => before <= t).reduce((sum, { cut }) => sum + cut, 0);
  // A moment inside a shrunk pause (an event without time, like tokens, can stand there) is
  // placed at the end of the pause that was kept, so that time never goes back at the next event.
  const keptPart = (t: number) =>
    cuts.reduce((moment, { before, cut }) => {
      const keptEnd = before - cut;

      return moment > keptEnd && moment < before ? keptEnd : moment;
    }, t);
  const at = (t: number) => keptPart(t) - first.from - cutBefore(keptPart(t));

  return { start: first.from, end: at(last.to), at };
}
