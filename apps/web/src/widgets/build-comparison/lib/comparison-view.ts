import { stageModelsOf, summarize, type SessionRecord, type StageModels } from "@cyberzavod/core";
import {
  costOfRecording,
  recordingUrl,
  reworksByStageOf,
  stageReworksDetailOf,
} from "@/entities/recording";
import { AGENT_NAMES } from "@/shared/config/agents.ts";
import { STAGE_LABELS } from "@/shared/config/stages.ts";
import type { Locale } from "@/shared/i18n/locale.ts";
import { UI_TEXT } from "@/shared/i18n/ui-text.ts";
import {
  formatCost,
  formatDate,
  formatDuration,
  formatModel,
  formatNumber,
  formatTokens,
} from "@/shared/lib/format.ts";
import type { StatItem } from "@/shared/ui";

const TEXT = UI_TEXT.comparison;
const MODEL_SEPARATOR = " → ";

/** Models that ran one stage of the run, ready to show. */
export interface StageModelsView {
  readonly label: string;
  /** Model names in the order of the stage entries: "Claude Sonnet 4.6 → Claude Opus 5.5". */
  readonly models: string;
}

/** One run of the task as a column of the comparison. */
export interface ComparisonColumn {
  readonly title: string;
  /** Original language of the recording: its title is shown in it. */
  readonly language: string;
  readonly url: string;
  readonly day: string;
  readonly agent: string;
  /** Workflow and harness version: a difference between the runs is visible by eye. */
  readonly process: string;
  readonly stages: readonly StageModelsView[];
  readonly counters: readonly StatItem[];
}

function agentOf(recording: SessionRecord, locale: Locale): string {
  const { source } = recording;

  if (source.type === "manual") return TEXT.manual[locale];

  return AGENT_NAMES[source.agent] ?? source.agent;
}

function stageModelsViewOf({ stage, models }: StageModels, locale: Locale): StageModelsView {
  const label = STAGE_LABELS[stage][locale];

  if (models.length === 0) return { label, models: TEXT.unknownModel[locale] };

  return { label, models: models.map(formatModel).join(MODEL_SEPARATOR) };
}

function reworksItemOf(recording: SessionRecord, reworks: number, locale: Locale): StatItem {
  const stageReworks = reworksByStageOf([recording]);

  return {
    label: UI_TEXT.hud.reworks[locale],
    value: formatNumber(reworks, locale),
    detail: stageReworksDetailOf(stageReworks, locale),
  };
}

function costItemOf(recording: SessionRecord, locale: Locale): StatItem {
  const usd = costOfRecording(recording);

  return {
    label: TEXT.cost[locale],
    value: usd === undefined ? TEXT.unknownCost[locale] : formatCost(usd, locale),
  };
}

function outcomeItemOf(ok: boolean, locale: Locale): StatItem {
  return {
    label: TEXT.outcome[locale],
    value: ok ? TEXT.passed[locale] : TEXT.failed[locale],
  };
}

/**
 * Prepares one run of a task for the comparison: the agent, the models by stage and the counters.
 * The agent of every stage is the record's source: a project is led by one agent.
 * @param {SessionRecord} recording The run.
 * @param {Locale} locale Page language: captions, numbers, dates and durations are in it.
 * @returns {ComparisonColumn} The column to show.
 */
export function comparisonColumnOf(recording: SessionRecord, locale: Locale): ComparisonColumn {
  const stats = summarize(recording);
  const { title, language, workflow, harness } = recording.data;

  return {
    title,
    language,
    url: recordingUrl(recording.id, locale),
    day: formatDate(recording.timestamp, locale),
    agent: agentOf(recording, locale),
    process: TEXT.process[locale](workflow, harness),
    stages: stageModelsOf(recording).map((stageModels) => stageModelsViewOf(stageModels, locale)),
    counters: [
      { label: UI_TEXT.hud.time[locale], value: formatDuration(stats.durationMs, locale) },
      { label: UI_TEXT.hud.tokens[locale], value: formatTokens(stats.tokens, locale) },
      costItemOf(recording, locale),
      reworksItemOf(recording, stats.reworks, locale),
      outcomeItemOf(stats.ok, locale),
    ],
  };
}
