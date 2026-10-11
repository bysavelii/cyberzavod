import { API_PAGES, QUERY_PARAMS } from "@/shared/config/routes.ts";
import { DEFAULT_LOCALE, type Locale } from "@/shared/i18n/locale.ts";
import { localizedPath } from "@/shared/i18n/path.ts";

/** Alt text of the badge image in Markdown: the same string `cyberzavod gallery` prints. */
const BADGE_ALT = "Built at Cyberzavod";

function withQuery(path: string, name: string, value: string): string {
  const query = new URLSearchParams({ [name]: value });

  return `${path}?${query.toString()}`;
}

function galleriesUrl(locale: Locale): string {
  return localizedPath(locale, API_PAGES.galleries);
}

/**
 * The address of an author's public gallery.
 * @param {string} login Author's GitHub login.
 * @param {Locale} locale Page language.
 * @returns {string} A path like `/gallery/?user=alice`.
 */
export function galleryUrl(login: string, locale: Locale): string {
  return withQuery(galleriesUrl(locale), QUERY_PARAMS.galleryOwner, login);
}

/**
 * The address of a gallery recording by secret link.
 * @param {string} slug The secret part of the link from `Summary.slug`.
 * @param {Locale} locale Page language.
 * @returns {string} A path like `/r/?id=k3f9x2m1q8zt`.
 */
export function sharedRecordingUrl(slug: string, locale: Locale): string {
  const page = localizedPath(locale, API_PAGES.sharedRecording);

  return withQuery(page, QUERY_PARAMS.recording, slug);
}

/**
 * The address of the author's badge image: the API serves it.
 * @param {string} login Author's GitHub login.
 * @returns {string} A path like `/api/badges/alice.svg`.
 */
export function badgeImageUrl(login: string): string {
  return `/api/badges/${encodeURIComponent(login)}.svg`;
}

/**
 * Markdown line for a README: a badge linking to the author's gallery. Addresses are absolute,
 * since the README lives on another site; the gallery is in the default language, like all
 * external links to the site.
 * @param {string} login Author's GitHub login.
 * @param {string} siteUrl Site address, `site` from the Astro config.
 * @returns {string} A line like
 *   `[![Built at Cyberzavod](…/api/badges/alice.svg)](…/gallery/?user=alice)`.
 */
export function badgeMarkdown(login: string, siteUrl: string): string {
  const image = new URL(badgeImageUrl(login), siteUrl);
  const gallery = new URL(galleryUrl(login, DEFAULT_LOCALE), siteUrl);

  return `[![${BADGE_ALT}](${image.href})](${gallery.href})`;
}

/**
 * Reads the value for a gallery page from the address parameters: a recording slug or an author
 * login.
 * @param {string} search Address parameters, `location.search`.
 * @param {keyof typeof QUERY_PARAMS} param Which parameter is needed.
 * @returns {string | undefined} The value, or `undefined` if the parameter is missing or empty.
 */
export function queryParamOf(search: string, param: keyof typeof QUERY_PARAMS): string | undefined {
  const value = new URLSearchParams(search).get(QUERY_PARAMS[param]);

  return value === null || value === "" ? undefined : value;
}
