// Formatting of numbers, times and dates for recording pages and the counters over the factory
// floor. The language comes as a parameter: pages are built ahead of time and do not know the
// viewer's language.

import { byLocale, LOCALE_TAGS, type Locale } from "@/shared/i18n/locale.ts";
import { UI_TEXT } from "@/shared/i18n/ui-text.ts";

const SECOND_MS = 1000;
const MINUTE_SECONDS = 60;
const HOUR_MINUTES = 60;

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

// The time counter and the timeline clock show the same duration, so their seconds round the same
// way; otherwise "17 min 22 s" in the totals would sit next to "17:21" on the timeline.
function wholeSecondsOf(ms: number): number {
  return Math.round(ms / SECOND_MS);
}

/**
 * Formats a duration for a counter: seconds, minutes with seconds, or hours with minutes.
 * @param {number} ms Duration in milliseconds.
 * @param {Locale} locale Language of the unit labels.
 * @returns {string} A string like "42 s", "2 min 05 s" or "1 h 05 min"; in Russian «42 с»,
 * «2 мин 05 с», «1 ч 05 мин».
 */
export function formatDuration(ms: number, locale: Locale): string {
  const { hour, minute, second } = UI_TEXT.duration;
  const totalSeconds = wholeSecondsOf(ms);
  const totalMinutes = Math.floor(totalSeconds / MINUTE_SECONDS);
  const hours = Math.floor(totalMinutes / HOUR_MINUTES);

  if (hours > 0) {
    return `${hours} ${hour[locale]} ${twoDigits(totalMinutes % HOUR_MINUTES)} ${minute[locale]}`;
  }
  if (totalMinutes > 0) {
    return `${totalMinutes} ${minute[locale]} ${twoDigits(totalSeconds % MINUTE_SECONDS)} ${second[locale]}`;
  }

  return `${totalSeconds} ${second[locale]}`;
}

/**
 * Formats a moment of a build from its start, like the time on the player's timeline. Seconds
 * round the same way as in `formatDuration`.
 * @param {number} ms Milliseconds from the start of the build.
 * @returns {string} A string like "2:05" or "1:02:05".
 */
export function formatClock(ms: number): string {
  const totalSeconds = wholeSecondsOf(ms);
  const totalMinutes = Math.floor(totalSeconds / MINUTE_SECONDS);
  const hours = Math.floor(totalMinutes / HOUR_MINUTES);
  const seconds = twoDigits(totalSeconds % MINUTE_SECONDS);

  if (hours === 0) return `${totalMinutes}:${seconds}`;

  return `${hours}:${twoDigits(totalMinutes % HOUR_MINUTES)}:${seconds}`;
}

const NUMBER_FORMATTERS = byLocale((locale) => new Intl.NumberFormat(LOCALE_TAGS[locale]));

/**
 * Formats a number with digit grouping.
 * @param {number} value Number.
 * @param {Locale} locale Language whose rules group the digits.
 * @returns {string} A string like "12,345"; in Russian "12 345".
 */
export function formatNumber(value: number, locale: Locale): string {
  return NUMBER_FORMATTERS[locale].format(value);
}

const PERCENT_FORMATTERS = byLocale(
  (locale) =>
    new Intl.NumberFormat(LOCALE_TAGS[locale], { style: "percent", maximumFractionDigits: 0 }),
);

/**
 * Formats a share as a whole percent.
 * @param {number} share Share from 0 to 1.
 * @param {Locale} locale Language whose rules write the number and the percent sign.
 * @returns {string} A string like "57%"; in Russian «57 %» with a non-breaking space.
 */
export function formatPercent(share: number, locale: Locale): string {
  return PERCENT_FORMATTERS[locale].format(share);
}

/**
 * Formats a token count with digit grouping.
 * @param {number} tokens Token count.
 * @param {Locale} locale Language whose rules group the digits.
 * @returns {string} A string like "1,234,567"; in Russian "1 234 567".
 */
export function formatTokens(tokens: number, locale: Locale): string {
  return formatNumber(tokens, locale);
}

const COST_FRACTION_DIGITS = 2;
const CENT_USD = 0.01;
const COST_FORMATTERS = byLocale(
  (locale) =>
    new Intl.NumberFormat(LOCALE_TAGS[locale], {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: COST_FRACTION_DIGITS,
      maximumFractionDigits: COST_FRACTION_DIGITS,
    }),
);

/**
 * Formats a cost in dollars with a cent precision. A positive cost under a cent is shown as
 * "under a cent", so a small cost does not look like nothing.
 * @param {number} usd Amount in US dollars.
 * @param {Locale} locale Language whose rules write the number and the currency sign.
 * @returns {string} A string like "$1.80"; in Russian «1,80 $»; «< $0.01» for 0.003.
 */
export function formatCost(usd: number, locale: Locale): string {
  const formatter = COST_FORMATTERS[locale];

  if (usd > 0 && usd < CENT_USD) {
    return UI_TEXT.cost.underCent[locale](formatter.format(CENT_USD));
  }

  return formatter.format(usd);
}

// Pages are built ahead of time without the viewer's time zone, so the day is in UTC, as in the
// recording id.
const DATE_FORMATTERS = byLocale(
  (locale) =>
    new Intl.DateTimeFormat(LOCALE_TAGS[locale], {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
);

/**
 * Formats the start day of a recording for a caption.
 * @param {string} startedAt Time in ISO 8601: `2026-10-04T09:52:13.000Z`.
 * @param {Locale} locale Language of the month name and the order of the date parts.
 * @returns {string} A string like "October 4, 2026"; in Russian «4 октября 2026 г.».
 */
export function formatDate(startedAt: string, locale: Locale): string {
  return DATE_FORMATTERS[locale].format(new Date(startedAt));
}

// Claude model id: `claude-opus-5-5`; older ones carry a release date, sometimes no minor version:
// `claude-haiku-4-5-20251001`, `claude-sonnet-4-20250514`.
const CLAUDE_MODEL_ID = /^claude-([a-z]+)-(\d{1,2})(?:-(\d{1,2}))?(?:-\d{8})?$/;

/**
 * Turns a model id into a name for a caption; an unknown id is shown as is.
 * @param {string} id Model id: `claude-opus-5-5`.
 * @returns {string} A name like "Claude Opus 5.5" or "Claude Sonnet 4".
 */
export function formatModel(id: string): string {
  const [, family, major, minor] = CLAUDE_MODEL_ID.exec(id) ?? [];

  if (family === undefined || major === undefined) return id;

  const version = minor === undefined ? major : `${major}.${minor}`;
  const familyName = family.charAt(0).toUpperCase() + family.slice(1);

  return `Claude ${familyName} ${version}`;
}

/** Word forms for a number in each language: Russian has three forms, English two. */
export interface PluralWords {
  /** «1 промпт», «2 промпта», «5 промптов» (1, 2 and 5 prompts). */
  readonly ru: { readonly one: string; readonly few: string; readonly many: string };
  /** «1 prompt», «2 prompts». */
  readonly en: { readonly one: string; readonly other: string };
}

const PLURAL_RULES = byLocale((locale) => new Intl.PluralRules(LOCALE_TAGS[locale]));
const COUNT_FORMATTERS = byLocale((locale) => new Intl.NumberFormat(LOCALE_TAGS[locale]));

function russianWordFor(count: number, words: PluralWords["ru"]): string {
  const category = PLURAL_RULES.ru.select(count);

  switch (category) {
    case "one":
      return words.one;
    case "few":
      return words.few;
    default:
      return words.many;
  }
}

function wordFor(count: number, words: PluralWords, locale: Locale): string {
  switch (locale) {
    case "ru":
      return russianWordFor(count, words.ru);
    case "en":
      return PLURAL_RULES.en.select(count) === "one" ? words.en.one : words.en.other;
    default:
      // A new language will not compile until its word forms are described.
      return locale satisfies never;
  }
}

/**
 * Writes a number with a word in the right form.
 * @param {number} count Integer.
 * @param {PluralWords} words Word forms in each language.
 * @param {Locale} locale Language whose rules choose the form and write the number.
 * @returns {string} A string like "1 prompt" or "2 prompts"; in Russian «5 промптов» or
 * «2 875 954 токена».
 */
export function formatCount(count: number, words: PluralWords, locale: Locale): string {
  return `${COUNT_FORMATTERS[locale].format(count)} ${wordFor(count, words, locale)}`;
}

const LANGUAGE_NAMES = byLocale(
  (locale) => new Intl.DisplayNames(LOCALE_TAGS[locale], { type: "language", fallback: "code" }),
);

/**
 * Names a language by its code in the page language: this tells the viewer the recording's
 * language.
 * @param {string} code ISO 639 language code: `ru`, `en`.
 * @param {Locale} locale Page language.
 * @returns {string} Language name: "Russian", «английский»; an unknown code as is.
 */
export function formatLanguage(code: string, locale: Locale): string {
  return LANGUAGE_NAMES[locale].of(code) ?? code;
}
