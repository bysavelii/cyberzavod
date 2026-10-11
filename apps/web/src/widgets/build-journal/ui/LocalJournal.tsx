import { onMount, Show, type JSX } from "solid-js";
import {
  $chosenRecording,
  $localRecordings,
  noticeOf,
  openLocalRecordings,
} from "@/features/local-recordings";
import type { Locale } from "@/shared/i18n/locale.ts";
import { useStoreValue } from "@/shared/lib/use-store-value.ts";
import { JournalTimeline } from "./JournalTimeline.tsx";
import styles from "./Timeline.module.css";

interface Props {
  /** Page language: journal labels, captions and messages are in it. */
  locale: Locale;
}

/**
 * Build journal of the recording on the `cyberzavod view` floor: the recording comes from the
 * local server in the browser and changes when the human picks another; until there is one, a
 * message says why.
 * @param {Props} props Component props.
 * @param {Locale} props.locale Page language.
 * @returns {JSX.Element} Journal or message.
 */
export function LocalJournal(props: Props): JSX.Element {
  const state = useStoreValue($localRecordings);
  const chosen = useStoreValue($chosenRecording);

  onMount(() => void openLocalRecordings());

  return (
    <Show when={chosen()} fallback={<p class={styles.empty}>{noticeOf(state(), props.locale)}</p>}>
      {(record) => <JournalTimeline recording={record()} locale={props.locale} />}
    </Show>
  );
}
