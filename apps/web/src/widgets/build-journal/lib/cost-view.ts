import { briefOf, costOf, PRICES_AS_OF, type Cost, type SessionRecord } from "@cyberzavod/core";
import { usdOfCost } from "@/entities/recording";
import { STAGE_LABELS } from "@/shared/config/stages.ts";
import type { Locale } from "@/shared/i18n/locale.ts";
import { UI_TEXT } from "@/shared/i18n/ui-text.ts";
import { formatCost, formatDate } from "@/shared/lib/format.ts";
import type { StatItem } from "@/shared/ui";

const TEXT = UI_TEXT.cost;

/** The cost block of a recording page, ready to show. */
export interface CostView {
  /** The total, the cost before the first stage (if any) and the cost of each stage. */
  readonly items: readonly StatItem[];
  /** What the prices are and what the amount is not. */
  readonly note: string;
}

// A total is known only if every part is, so a part without a cost cannot reach the block.
function itemsOfKnownCost(label: string, cost: Cost, locale: Locale): StatItem[] {
  const usd = usdOfCost(cost);

  return usd === undefined ? [] : [{ label, value: formatCost(usd, locale) }];
}

function beforeStagesItemOf(cost: Cost, locale: Locale): StatItem[] {
  const isFree = usdOfCost(cost) === 0;

  return isFree ? [] : itemsOfKnownCost(TEXT.beforeStages[locale], cost, locale);
}

/**
 * Prepares the cost block of a recording page: the total and its parts, whose sum is the total.
 * @param {SessionRecord} recording The recording.
 * @param {Locale} locale Page language: captions, amounts and the date are in it.
 * @returns {CostView | undefined} The block, or `undefined` if the cost cannot be told (a record
 * made before the token breakdown): then the page has no block, not a zero.
 */
export function costViewOf(recording: SessionRecord, locale: Locale): CostView | undefined {
  const { total, beforeStages, stages } = costOf(briefOf(recording));

  if (total.kind === "unknown") return undefined;

  const stageItems = stages.flatMap(({ stage, cost }) =>
    itemsOfKnownCost(STAGE_LABELS[stage][locale], cost, locale),
  );

  return {
    items: [
      ...itemsOfKnownCost(TEXT.total[locale], total, locale),
      ...beforeStagesItemOf(beforeStages, locale),
      ...stageItems,
    ],
    note: TEXT.note[locale](formatDate(PRICES_AS_OF, locale)),
  };
}
