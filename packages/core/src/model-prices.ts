// Prices of the models by the kinds of tokens the API charges for. Cost is derived from these
// numbers in `cost.ts`; no other file holds a price.

import type { TokenBreakdown } from "./record.ts";

/** USD per `TOKENS_PER_PRICE_UNIT` tokens of each kind; the kinds are those of a breakdown. */
export type ModelPrice = Readonly<TokenBreakdown>;

/** Tokens the prices are quoted for: the price tables list USD per million tokens. */
export const TOKENS_PER_PRICE_UNIT = 1_000_000;

/** The day the prices below were checked against the official page, `YYYY-MM-DD`. */
export const PRICES_AS_OF = "2026-10-11";

// A snapshot id is the model id with a `-YYYYMMDD` suffix: `claude-sonnet-4-5-20250929`.
const SNAPSHOT_SUFFIX = /-\d{8}$/;

// Current prices of Anthropic models, USD per million tokens, API list prices:
// https://platform.claude.com/docs/en/about-claude/pricing
//
// Only today's prices: a row has no start date, because a price almost always changes together
// with a new model id, and a new id is a new row that old records do not touch. If the price of an
// id that is already here changes, do not overwrite it: add rows with a start date and let
// `priceOf` choose by the date of the record, or old records are priced wrongly.
//
// Not accounted for: fast mode, `inference_geo` (x1.1), the batch discount. Claude Sonnet 4.5 is
// at its base price, but its 1M-context beta costs more for requests over 200K tokens, and the
// transcript id is the same. Claude Haiku 5.5 is absent on purpose: its price depends on the
// length of each request, which a sum of tokens cannot restore. There are no OpenAI rows: their
// prices are not confirmed, so the cost of a Codex record is unknown.
const MODEL_PRICES: Readonly<Record<string, ModelPrice>> = {
  "claude-fable-5-1": price(10, 12.5, 20, 0.25, 50),
  "claude-fable-5": price(10, 12.5, 20, 1, 50),
  "claude-opus-5-5": price(4, 5, 8, 0.2, 20),
  "claude-opus-5": price(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-8": price(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-7": price(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-6": price(5, 6.25, 10, 0.5, 25),
  "claude-opus-4-5": price(5, 6.25, 10, 0.5, 25),
  "claude-sonnet-5-5": price(2, 2.5, 4, 0.1, 10),
  "claude-sonnet-5": price(2, 2.5, 4, 0.2, 10),
  "claude-sonnet-4-6": price(3, 3.75, 6, 0.3, 15),
  "claude-sonnet-4-5": price(3, 3.75, 6, 0.3, 15),
  "claude-haiku-4-5": price(1, 1.25, 2, 0.1, 5),
};

// The order of arguments follows the columns of the official table.
function price(
  input: number,
  cacheWrite5m: number,
  cacheWrite1h: number,
  cacheRead: number,
  output: number,
): ModelPrice {
  return { input, output, cacheRead, cacheWrite5m, cacheWrite1h };
}

/**
 * Finds the price of a model: by the exact id, then by the id without a `-YYYYMMDD` snapshot
 * suffix.
 * @param {string} model Model id as the agent wrote it, like `claude-sonnet-4-5-20250929`.
 * @returns {ModelPrice | undefined} The price, or `undefined` if the model is not in the table.
 */
export function priceOf(model: string): ModelPrice | undefined {
  const exact = Object.hasOwn(MODEL_PRICES, model) ? MODEL_PRICES[model] : undefined;

  if (exact !== undefined) return exact;

  const withoutSnapshot = model.replace(SNAPSHOT_SUFFIX, "");

  return Object.hasOwn(MODEL_PRICES, withoutSnapshot) ? MODEL_PRICES[withoutSnapshot] : undefined;
}
