// Addresses of pages built from API responses in the browser. The file has no aliased imports:
// `astro.config.ts` reads it too, for the sitemap filter.

/**
 * Language-free paths of pages whose data comes from the API in the browser: one page serves all
 * galleries and recordings, and what to show is in the query parameters.
 */
export const API_PAGES = {
  sharedRecording: "/r/",
  galleries: "/gallery/",
  /** The signed-in author's account page: their gallery and recordings. */
  cabinet: "/me/",
} as const;

/** Query parameter names of the pages in `API_PAGES`. */
export const QUERY_PARAMS = {
  /** Secret slug of a gallery recording: `/r/?id=<slug>`. */
  recording: "id",
  /** Login of the public gallery's author: `/gallery/?user=<login>`. */
  galleryOwner: "user",
  /** Interface language of the `cyberzavod view` page, a site language code: `/?lang=ru`. */
  language: "lang",
} as const;

// A gallery or a recording is visible only by its link, and each author has their own account
// page: search engines do not need these pages, and without a query parameter or sign-in they
// are empty. One static page serves all galleries, so it cannot be closed for some of them only.
const UNINDEXED_PATHS: readonly string[] = [
  API_PAGES.sharedRecording,
  API_PAGES.galleries,
  API_PAGES.cabinet,
];

/**
 * Whether the page is hidden from search engines: such a page gets `noindex` and stays out of the
 * sitemap.
 * @param {string} path Language-free page path: `/r/`, `/gallery/`, `/me/`.
 * @returns {boolean} `true` if the page is not indexed.
 */
export function isUnindexedPath(path: string): boolean {
  return UNINDEXED_PATHS.includes(path);
}
