// Cost of a session in USD at API list prices, derived from its `usage` events.

import { priceOf, TOKENS_PER_PRICE_UNIT, type ModelPrice } from "./model-prices.ts";
import type { BriefSessionRecord, TokenBreakdown, UsageEvent } from "./record.ts";
import { STAGES, type Stage } from "./stage.ts";

/** Why a cost cannot be told. A cost is never made up: it is either known or unknown. */
export type UnknownCostReason =
  | { type: "no_usage" }
  | { type: "no_breakdown" }
  | { type: "no_model" }
  | { type: "unpriced_model"; model: string };

/** A cost in USD, or the reason it is unknown. Unknown is not zero. */
export type Cost = { kind: "known"; usd: number } | { kind: "unknown"; reason: UnknownCostReason };

/** Cost of one stage of a session. */
export interface StageCost {
  readonly stage: Stage;
  readonly cost: Cost;
}

/** Cost of a session: the total and the parts it is the sum of. */
export interface SessionCost {
  /** Sum of `beforeStages` and all `stages`; unknown if any part is, or if there is no `usage`. */
  readonly total: Cost;
  /** Tokens spent before the first stage: the foreman reads the task before the first stage. */
  readonly beforeStages: Cost;
  /** Entered stages in the order of `STAGES`; a stage with no `usage` costs $0. */
  readonly stages: readonly StageCost[];
}

function unknownCost(reason: UnknownCostReason): Cost {
  return { kind: "unknown", reason };
}

function usdOf(breakdown: TokenBreakdown, price: ModelPrice): number {
  const priceUnits =
    breakdown.input * price.input +
    breakdown.output * price.output +
    breakdown.cacheRead * price.cacheRead +
    breakdown.cacheWrite5m * price.cacheWrite5m +
    breakdown.cacheWrite1h * price.cacheWrite1h;

  return priceUnits / TOKENS_PER_PRICE_UNIT;
}

function costOfUsage(usage: UsageEvent): Cost {
  if (usage.breakdown === undefined) return unknownCost({ type: "no_breakdown" });
  if (usage.model === undefined) return unknownCost({ type: "no_model" });

  const price = priceOf(usage.model);

  if (price === undefined) return unknownCost({ type: "unpriced_model", model: usage.model });

  return { kind: "known", usd: usdOf(usage.breakdown, price) };
}

// The first unknown cost decides the result, so the reason is the first one in the order given.
function sumCosts(costs: readonly Cost[]): Cost {
  let usd = 0;

  for (const cost of costs) {
    if (cost.kind === "unknown") return cost;

    usd += cost.usd;
  }

  return { kind: "known", usd };
}

interface UsagesOfStages {
  readonly beforeStages: UsageEvent[];
  readonly byStage: ReadonlyMap<Stage, UsageEvent[]>;
}

// A `usage` belongs to the stage the last `stage_enter` before it (by position) named.
function usagesOfStages(session: BriefSessionRecord): UsagesOfStages {
  const beforeStages: UsageEvent[] = [];
  const byStage = new Map<Stage, UsageEvent[]>();
  let current: UsageEvent[] = beforeStages;

  for (const event of session.data.events) {
    if (event.type === "stage_enter") {
      current = byStage.get(event.stage) ?? [];
      byStage.set(event.stage, current);
    }

    if (event.type === "usage") current.push(event);
  }

  return { beforeStages, byStage };
}

/**
 * Derives the cost of a session from its `usage` events by the price of the model each event
 * names. The single place that knows how the cost of a record is put together. An event belongs
 * to the stage the last `stage_enter` before it named; events before the first one are
 * `beforeStages`. The cost of a part is unknown if any of its events is: a record made before
 * the breakdown, an event with no model, a model that is not in the price table.
 * @param {BriefSessionRecord} session The validated session.
 * @returns {SessionCost} The total, the cost before the first stage and the cost of every entered
 * stage in the order of `STAGES`.
 */
export function costOf(session: BriefSessionRecord): SessionCost {
  const { beforeStages, byStage } = usagesOfStages(session);
  const hasUsage = session.data.events.some((event) => event.type === "usage");
  const beforeStagesCost = sumCosts(beforeStages.map(costOfUsage));
  const stages = STAGES.flatMap((stage) => {
    const usages = byStage.get(stage);

    return usages === undefined ? [] : [{ stage, cost: sumCosts(usages.map(costOfUsage)) }];
  });
  const total = hasUsage
    ? sumCosts([beforeStagesCost, ...stages.map(({ cost }) => cost)])
    : unknownCost({ type: "no_usage" });

  return { total, beforeStages: beforeStagesCost, stages };
}
