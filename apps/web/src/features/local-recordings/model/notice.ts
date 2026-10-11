import type { LocalRecordings } from "@/entities/recording-file";
import type { Remote } from "@/shared/api/remote.ts";
import type { Locale } from "@/shared/i18n/locale.ts";
import { UI_TEXT } from "@/shared/i18n/ui-text.ts";

/**
 * Message in place of a local recording while there is nothing to play: loading, a failed or
 * broken answer, or a project without recordings and drafts.
 * @param {Remote<LocalRecordings>} state State of the list.
 * @param {Locale} locale Page language.
 * @returns {string | undefined} Message text, or `undefined` if there is a recording to play.
 */
export function noticeOf(state: Remote<LocalRecordings>, locale: Locale): string | undefined {
  switch (state.status) {
    case "ready": {
      const isEmpty = state.value.drafts.length + state.value.published.length === 0;

      return isEmpty ? UI_TEXT.viewer.empty[locale] : undefined;
    }

    case "loading":
      return UI_TEXT.viewer.loading[locale];
    case "broken":
      return UI_TEXT.viewer.broken[locale];
    // The local server has no "not found" answer, so a missing list is a failure like any other.
    case "missing":
    case "failed":
      return UI_TEXT.viewer.failed[locale];
    default:
      return state satisfies never;
  }
}
