import { site } from "@/shared/config/site.ts";
import { DEFAULT_LOCALE } from "@/shared/i18n/locale.ts";
import { galleryUrl, sharedRecordingUrl } from "./url.ts";

/** File name of the issue form for reports, in `.github/ISSUE_TEMPLATE/`. */
export const REPORT_TEMPLATE = "report-content.yml";

/** Id of the form field that holds the link to what is reported; the form requires it. */
export const REPORT_LINK_FIELD = "link";

function reportUrl(subjectPath: string, siteUrl: string): string {
  const subject = new URL(subjectPath, siteUrl);
  const query = new URLSearchParams({
    template: REPORT_TEMPLATE,
    [REPORT_LINK_FIELD]: subject.href,
  });

  return `${site.repoUrl}/issues/new?${query.toString()}`;
}

/**
 * The address of a new GitHub issue that reports a gallery recording: the form opens with the
 * recording's absolute address in the link field. The address is in the default language, like
 * all external links to the site.
 * @param {string} slug The secret part of the recording's link.
 * @param {string} siteUrl Site address, `site` from the Astro config.
 * @returns {string} An address like `https://github.com/<repo>/issues/new?template=…&link=…`.
 */
export function recordingReportUrl(slug: string, siteUrl: string): string {
  return reportUrl(sharedRecordingUrl(slug, DEFAULT_LOCALE), siteUrl);
}

/**
 * The address of a new GitHub issue that reports an author's gallery: the form opens with the
 * gallery's absolute address in the link field.
 * @param {string} login Author's GitHub login.
 * @param {string} siteUrl Site address, `site` from the Astro config.
 * @returns {string} An address like `https://github.com/<repo>/issues/new?template=…&link=…`.
 */
export function galleryReportUrl(login: string, siteUrl: string): string {
  return reportUrl(galleryUrl(login, DEFAULT_LOCALE), siteUrl);
}
