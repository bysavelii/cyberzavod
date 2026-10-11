// Tokens by the model that spent them: one sum per model, one `usage` event per sum. A price is a
// property of the model, so tokens of different models are never mixed into one event.

import {
  addBreakdowns,
  countedTokensOf,
  NO_BREAKDOWN,
  type TokenBreakdown,
  type UsageEvent,
} from "@cyberzavod/core";
import { withOptional } from "./raw-event.ts";
import type { ModelTokens } from "./transcript-model.ts";

/**
 * Sums the messages' tokens by model, in the order the models first appear. Messages without a
 * model form a group of their own: their price is unknown, and they are not mixed into a known
 * model's tokens.
 * @param {readonly ModelTokens[]} messages Tokens of model messages, each with its model.
 * @returns {ModelTokens[]} One sum per model.
 */
export function tokensByModel(messages: readonly ModelTokens[]): ModelTokens[] {
  const sums = new Map<string | undefined, TokenBreakdown>();

  for (const { model, breakdown } of messages) {
    sums.set(model, addBreakdowns(sums.get(model) ?? NO_BREAKDOWN, breakdown));
  }

  return [...sums].map(([model, breakdown]) => withOptional<ModelTokens>({ breakdown }, { model }));
}

/**
 * Makes a `usage` event for each model's tokens.
 * @param {readonly ModelTokens[]} tokens Tokens by model.
 * @param {number} t Time of the events.
 * @returns {UsageEvent[]} One event per model, with the counter, the model and the breakdown.
 */
export function usageEventsOf(tokens: readonly ModelTokens[], t: number): UsageEvent[] {
  return tokens.map(({ model, breakdown }) =>
    withOptional<UsageEvent>(
      { t, type: "usage", tokens: countedTokensOf(breakdown), breakdown },
      { model },
    ),
  );
}
