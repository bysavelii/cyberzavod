import { onMount, Show, type JSX } from "solid-js";
import { queryParamOf, recordingReportUrl } from "@/entities/gallery";
import { $sharedRecording, noticeOf, openSharedRecording } from "@/features/shared-recording";
import type { Locale } from "@/shared/i18n/locale.ts";
import { UI_TEXT } from "@/shared/i18n/ui-text.ts";
import { useStoreValue } from "@/shared/lib/use-store-value.ts";
import { ButtonLink } from "@/shared/ui";
import { JournalTimeline } from "./JournalTimeline.tsx";
import styles from "./Timeline.module.css";

interface Props {
  /** Page language: journal labels, captions and messages are in it. */
  locale: Locale;
  /** Site address, `site` from the Astro config: the report form gets the recording's full link. */
  siteUrl: string;
}

// Runs only once the recording is loaded, that is, in the browser, where the address has the link.
function reportUrlOf(siteUrl: string): string | undefined {
  const slug = queryParamOf(window.location.search, "recording");

  return slug === undefined ? undefined : recordingReportUrl(slug, siteUrl);
}

/**
 * Build journal of a gallery recording: the recording comes from the API in the browser; while it
 * is missing, a message says why. Once it is loaded, a link above the journal reports it.
 * @param {Props} props Component props.
 * @param {Locale} props.locale Page language.
 * @param {string} props.siteUrl Site address.
 * @returns {JSX.Element} Journal or message.
 */
export function SharedJournal(props: Props): JSX.Element {
  const state = useStoreValue($sharedRecording);
  const recording = () => {
    const current = state();

    return current.status === "ready" ? current.value.record : undefined;
  };

  onMount(() => void openSharedRecording(window.location.search));

  return (
    <Show
      when={recording()}
      fallback={<p class={styles.empty}>{noticeOf(state(), props.locale)}</p>}
    >
      {(record) => (
        <>
          <Show when={reportUrlOf(props.siteUrl)}>
            {(reportUrl) => (
              <p class={styles.report}>
                <ButtonLink variant="link" href={reportUrl()}>
                  {UI_TEXT.sharedRecording.report[props.locale]}
                </ButtonLink>
              </p>
            )}
          </Show>
          <JournalTimeline recording={record()} locale={props.locale} />
        </>
      )}
    </Show>
  );
}
