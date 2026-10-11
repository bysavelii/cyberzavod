import { briefOf, costOf, type Cost, type SessionRecord } from "@cyberzavod/core";

/** Cost of several builds: how many have a known cost and its sum. */
export interface RecordingCostTotals {
  /** How many builds are counted. */
  readonly builds: number;
  /** How many of them have a known cost; the others are not in `usd`. */
  readonly buildsWithCost: number;
  /** Sum of the known costs in dollars. */
  readonly usd: number;
}

/**
 * Dollars of a cost.
 * @param {Cost} cost A known or an unknown cost.
 * @returns {number | undefined} The amount, or `undefined` if the cost is unknown: an unknown cost is
 * not zero.
 */
export function usdOfCost(cost: Cost): number | undefined {
  switch (cost.kind) {
    case "known":
      return cost.usd;
    case "unknown":
      return undefined;
  }
}

/**
 * Total cost of a recording in dollars at API prices.
 * @param {SessionRecord} recording The recording.
 * @returns {number | undefined} The cost, or `undefined` if it cannot be told (a record made before
 * the token breakdown, or a model without a price): an unknown cost is not zero.
 */
export function costOfRecording(recording: SessionRecord): number | undefined {
  return usdOfCost(costOf(briefOf(recording)).total);
}

/**
 * Sums the known costs of builds; a build with an unknown cost is counted but not added.
 * @param {readonly SessionRecord[]} recordings Build recordings in any order.
 * @returns {RecordingCostTotals} The totals; for an empty list all counters are zero.
 */
export function costTotalsOf(recordings: readonly SessionRecord[]): RecordingCostTotals {
  const costs = recordings.map(costOfRecording);
  const known = costs.filter((cost) => cost !== undefined);

  return {
    builds: recordings.length,
    buildsWithCost: known.length,
    usd: known.reduce((sum, cost) => sum + cost, 0),
  };
}

/**
 * Average cost of a build over the builds whose cost is known.
 * @param {RecordingCostTotals} totals Cost totals.
 * @returns {number | undefined} The average in dollars, or `undefined` if no build has a known
 * cost.
 */
export function averageCostOf(totals: RecordingCostTotals): number | undefined {
  if (totals.buildsWithCost === 0) return undefined;

  return totals.usd / totals.buildsWithCost;
}
