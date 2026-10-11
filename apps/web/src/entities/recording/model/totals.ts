import { summarize, type BuildStats, type SessionRecord } from "@cyberzavod/core";

/** Totals of several builds, e.g. all builds of a project: the sums of their counters. */
export interface RecordingTotals {
  /** How many builds are in the totals. */
  readonly builds: number;
  readonly durationMs: number;
  readonly tokens: number;
  readonly prompts: number;
  /** Reworks across all builds. */
  readonly reworks: number;
  /** How many builds passed every stage on the first try. */
  readonly buildsWithoutReworks: number;
  /** How many builds ended successfully. */
  readonly buildsSucceeded: number;
  readonly interventions: number;
}

/** A totals counter that can be divided by builds to get an average. */
export type SummedCount = Exclude<keyof RecordingTotals, "builds">;

const NO_TOTALS: RecordingTotals = {
  builds: 0,
  durationMs: 0,
  tokens: 0,
  prompts: 0,
  reworks: 0,
  buildsWithoutReworks: 0,
  buildsSucceeded: 0,
  interventions: 0,
};

function withBuild(totals: RecordingTotals, build: BuildStats): RecordingTotals {
  const isWithoutReworks = build.reworks === 0;

  return {
    builds: totals.builds + 1,
    durationMs: totals.durationMs + build.durationMs,
    tokens: totals.tokens + build.tokens,
    prompts: totals.prompts + build.prompts,
    reworks: totals.reworks + build.reworks,
    buildsWithoutReworks: totals.buildsWithoutReworks + (isWithoutReworks ? 1 : 0),
    buildsSucceeded: totals.buildsSucceeded + (build.ok ? 1 : 0),
    interventions: totals.interventions + build.interventions,
  };
}

/**
 * Sums build counters: this is how project totals are computed at site build time, without the API.
 * @param {readonly SessionRecord[]} recordings Build recordings in any order.
 * @returns {RecordingTotals} Totals; for an empty list all counters are zero.
 */
export function totalsOf(recordings: readonly SessionRecord[]): RecordingTotals {
  const builds = recordings.map((recording) => summarize(recording));

  return builds.reduce(withBuild, NO_TOTALS);
}

/**
 * Average counter value per build. Rounding is up to whoever displays it: time, to seconds.
 * @param {RecordingTotals} totals Build totals.
 * @param {SummedCount} count Which counter to divide.
 * @returns {number} The unrounded quotient; 0 for totals without builds.
 */
export function averagePerBuild(totals: RecordingTotals, count: SummedCount): number {
  if (totals.builds === 0) return 0;

  return totals[count] / totals.builds;
}

/**
 * Human participation in builds: their prompts and interventions together.
 * @param {RecordingTotals} totals Build totals.
 * @returns {number} How many times the human said something to the factory.
 */
export function humanInputOf(totals: RecordingTotals): number {
  return totals.prompts + totals.interventions;
}
