import {
  INTERVENTION_REASONS,
  type InterventionReason,
  type SessionRecord,
} from "@cyberzavod/core";

/** How many times the human was called for one reason across several builds. */
export interface ReasonInterventions {
  readonly reason: InterventionReason;
  readonly count: number;
}

/**
 * Counts the human interventions of several builds by their reason. Reasons come in the order of
 * `INTERVENTION_REASONS`, so the breakdown reads the same on every page; reasons that never called
 * the human are left out.
 * @param {readonly SessionRecord[]} recordings Build recordings in any order.
 * @returns {ReasonInterventions[]} Reasons with their intervention counts, only those with at
 *   least one.
 */
export function interventionsByReasonOf(
  recordings: readonly SessionRecord[],
): ReasonInterventions[] {
  const reasons = recordings.flatMap((recording) =>
    recording.data.events.flatMap((event) => (event.type === "intervention" ? [event.reason] : [])),
  );

  return INTERVENTION_REASONS.map((reason) => ({
    reason,
    count: reasons.filter((interventionReason) => interventionReason === reason).length,
  })).filter(({ count }) => count > 0);
}
