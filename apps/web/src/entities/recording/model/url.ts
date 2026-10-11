import type { Locale } from "@/shared/i18n/locale.ts";
import { localizedPath } from "@/shared/i18n/path.ts";

/**
 * The recording page address on the site.
 * @param {string} id Recording id.
 * @param {Locale} locale Page language.
 * @returns {string} A path like `/recordings/2026-10-07-79fd668f/`, for Russian with `/ru` prefix.
 */
export function recordingUrl(id: string, locale: Locale): string {
  return localizedPath(locale, `/recordings/${id}/`);
}

/**
 * The address of the comparison page of a task's runs.
 * @param {string} task Task label, as in `data.task` of the recordings.
 * @param {Locale} locale Page language.
 * @returns {string} A path like `/comparisons/split-bill/`, for Russian with `/ru` prefix.
 */
export function comparisonUrl(task: string, locale: Locale): string {
  return localizedPath(locale, `/comparisons/${task}/`);
}

/**
 * The analytics page address.
 * @param {Locale} locale Page language.
 * @returns {string} A path like `/stats/`, for Russian `/ru/stats/`.
 */
export function statsUrl(locale: Locale): string {
  return localizedPath(locale, "/stats/");
}
