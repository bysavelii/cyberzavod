import { queryParamOf } from "@/entities/gallery";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/shared/i18n/locale.ts";

/**
 * The interface language of the `cyberzavod view` page: the CLI puts its own in the address.
 * @param {string} search Address parameters, `location.search`.
 * @returns {Locale} The language from the address; the default one if it is missing or unknown.
 */
export function viewerLocaleOf(search: string): Locale {
  const language = queryParamOf(search, "language");

  return language !== undefined && isLocale(language) ? language : DEFAULT_LOCALE;
}
