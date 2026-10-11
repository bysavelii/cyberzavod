import type { SessionRecord } from "@cyberzavod/core";
import {
  averageCostOf,
  costTotalsOf,
  interventionsByReasonOf,
  projectSeriesOf,
  reworksByStageOf,
  totalsOf,
  type ReasonInterventions,
  type RecordingTotals,
  type StageReworks,
} from "@/entities/recording";
import { INTERVENTION_LABELS } from "@/shared/config/interventions.ts";
import { STAGE_LABELS } from "@/shared/config/stages.ts";
import type { Locale } from "@/shared/i18n/locale.ts";
import { UI_TEXT } from "@/shared/i18n/ui-text.ts";
import {
  formatCost,
  formatCount,
  formatNumber,
  formatPercent,
  formatTokens,
} from "@/shared/lib/format.ts";
import type { BarItem, StatItem } from "@/shared/ui";
import { barOf } from "./bars.ts";

/**
 * What the analytics page shows: a placeholder while there are no builds, or numbers and charts.
 */
export type StatsView =
  | { readonly kind: "empty" }
  | {
      readonly kind: "filled";
      readonly totals: readonly StatItem[];
      readonly returns: readonly BarItem[];
      readonly interventions: readonly BarItem[];
      readonly outcomes: readonly BarItem[];
    };

// The most frequent on top: the chart answers where the process stalls the most.
function mostFirst(a: BarItem, b: BarItem): number {
  return b.value - a.value || a.label.localeCompare(b.label);
}

function returnBarsOf(stageReworks: readonly StageReworks[], locale: Locale): BarItem[] {
  return stageReworks
    .map(({ stage, count }) => barOf(STAGE_LABELS[stage][locale], count, locale))
    .sort(mostFirst);
}

function interventionBarsOf(
  interventions: readonly ReasonInterventions[],
  locale: Locale,
): BarItem[] {
  return interventions
    .map(({ reason, count }) => barOf(INTERVENTION_LABELS[reason][locale], count, locale))
    .sort(mostFirst);
}

function outcomeBarsOf(totals: RecordingTotals, locale: Locale): BarItem[] {
  return [
    barOf(UI_TEXT.stats.succeeded[locale], totals.buildsSucceeded, locale),
    barOf(UI_TEXT.stats.failed[locale], totals.builds - totals.buildsSucceeded, locale),
  ];
}

// Called only for totals with builds, so the share does not divide by zero.
function firstPassItemOf(totals: RecordingTotals, locale: Locale): StatItem {
  return {
    label: UI_TEXT.reworks.firstPass[locale],
    value: formatPercent(totals.buildsWithoutReworks / totals.builds, locale),
    detail: UI_TEXT.reworks.firstPassOf[locale](totals.buildsWithoutReworks, totals.builds),
  };
}

// Only for builds with a known cost: an average over none is not shown, not made zero. The detail
// says how many builds the average is over, since builds made before the token breakdown have none.
function averageCostItemsOf(recordings: readonly SessionRecord[], locale: Locale): StatItem[] {
  const costTotals = costTotalsOf(recordings);
  const average = averageCostOf(costTotals);

  if (average === undefined) return [];

  const withCost = formatNumber(costTotals.buildsWithCost, locale);
  const builds = formatCount(costTotals.builds, UI_TEXT.stats.coveredBuilds, locale);

  return [
    {
      label: UI_TEXT.stats.averageCost[locale],
      value: formatCost(average, locale),
      detail: UI_TEXT.stats.costCoverage[locale](withCost, builds),
    },
  ];
}

interface TotalItemsInput {
  readonly totals: RecordingTotals;
  readonly projectCount: number;
  /** The average cost tile: empty while no build has a known cost. */
  readonly averageCostItems: readonly StatItem[];
  readonly locale: Locale;
}

function totalItemsOf({
  totals,
  projectCount,
  averageCostItems,
  locale,
}: TotalItemsInput): StatItem[] {
  return [
    { label: UI_TEXT.stats.builds[locale], value: formatNumber(totals.builds, locale) },
    { label: UI_TEXT.stats.projects[locale], value: formatNumber(projectCount, locale) },
    { label: UI_TEXT.hud.tokens[locale], value: formatTokens(totals.tokens, locale) },
    ...averageCostItems,
    firstPassItemOf(totals, locale),
    { label: UI_TEXT.hud.reworks[locale], value: formatNumber(totals.reworks, locale) },
    { label: UI_TEXT.hud.interventions[locale], value: formatNumber(totals.interventions, locale) },
  ];
}

/**
 * Prepares analytics for display: numbers and charts of rework by stage, interventions by reason
 * and build outcomes, labeled in the page language.
 * @param {readonly SessionRecord[]} recordings The site's build recordings.
 * @param {Locale} locale Page language.
 * @returns {StatsView} A placeholder if there are no builds, otherwise numbers and chart rows.
 */
export function statsViewOf(recordings: readonly SessionRecord[], locale: Locale): StatsView {
  if (recordings.length === 0) return { kind: "empty" };

  const totals = totalsOf(recordings);
  const projectCount = projectSeriesOf(recordings).length;

  return {
    kind: "filled",
    totals: totalItemsOf({
      totals,
      projectCount,
      averageCostItems: averageCostItemsOf(recordings, locale),
      locale,
    }),
    returns: returnBarsOf(reworksByStageOf(recordings), locale),
    interventions: interventionBarsOf(interventionsByReasonOf(recordings), locale),
    outcomes: outcomeBarsOf(totals, locale),
  };
}
