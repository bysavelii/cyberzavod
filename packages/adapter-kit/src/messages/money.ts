// Money in the texts of the adapters: dollars with two decimals, the same in every language.

/** Smallest amount shown as is; a positive amount below it is shown as «< $0.01». */
const SMALLEST_SHOWN_USD = 0.01;

/**
 * Formats an amount in US dollars with two decimals; a positive amount under a cent is
 * `< $0.01`, so a small cost is not shown as nothing.
 * @param {number} usd Amount in dollars.
 * @returns {string} The text, like `$1.80`.
 */
export function formatUsd(usd: number): string {
  if (usd > 0 && usd < SMALLEST_SHOWN_USD) return `< $${SMALLEST_SHOWN_USD.toFixed(2)}`;

  return `$${usd.toFixed(2)}`;
}
