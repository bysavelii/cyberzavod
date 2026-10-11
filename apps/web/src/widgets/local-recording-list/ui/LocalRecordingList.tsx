import { For, onMount, Show, type JSX } from "solid-js";
import {
  $chosenPlace,
  $localRecordings,
  chooseRecording,
  noticeOf,
  openLocalRecordings,
  type RecordingKind,
} from "@/features/local-recordings";
import { PANELS } from "@/shared/config/panels.ts";
import type { Locale, Translated } from "@/shared/i18n/locale.ts";
import { UI_TEXT } from "@/shared/i18n/ui-text.ts";
import { formatDate } from "@/shared/lib/format.ts";
import { useStoreValue } from "@/shared/lib/use-store-value.ts";
import { Button, Card, Chip, Title } from "@/shared/ui";
import { groupsOf, isChosen, type ListedRecording } from "../lib/groups.ts";
import styles from "./LocalRecordingList.module.css";

interface Props {
  /** Page language: captions and dates are in it. */
  locale: Locale;
}

const GROUP_HEADINGS: Readonly<Record<RecordingKind, Translated>> = {
  draft: UI_TEXT.viewer.drafts,
  published: UI_TEXT.viewer.recordings,
};

interface EntryProps extends Props {
  listed: ListedRecording;
}

// The choice puts the recording on the floor and closes the panel, so the floor is in view.
function Entry(props: EntryProps): JSX.Element {
  const chosenPlace = useStoreValue($chosenPlace);
  const record = () => props.listed.record;
  const isDraft = () => props.listed.place.kind === "draft";

  return (
    <Card current={isChosen(props.listed, chosenPlace())}>
      <div class={styles.entry}>
        <Button
          variant="link"
          class={styles.choose}
          popovertarget={PANELS.records}
          popovertargetaction="hide"
          onClick={() => chooseRecording(props.listed.place.kind, props.listed.place.index)}
        >
          <Title as="span" size="m" lang={record().data.language}>
            {record().data.title}
          </Title>
        </Button>
        <p class={styles.note}>
          <Show when={isDraft()}>
            <Chip tone="sun">{UI_TEXT.viewer.draft[props.locale]}</Chip>
          </Show>
          {formatDate(record().timestamp, props.locale)}
        </p>
      </div>
    </Card>
  );
}

/**
 * The list of `cyberzavod view`: the project's drafts and recordings in two groups. A choice puts
 * the recording on the factory floor and closes the panel. Until the list is ready, a message says
 * why there is none.
 * @param {Props} props Component props.
 * @param {Locale} props.locale Page language.
 * @returns {JSX.Element} The groups, or a message.
 */
export function LocalRecordingList(props: Props): JSX.Element {
  const state = useStoreValue($localRecordings);
  const notice = () => noticeOf(state(), props.locale);
  const groups = () => {
    const current = state();

    return current.status === "ready" ? groupsOf(current.value) : [];
  };

  onMount(() => void openLocalRecordings());

  return (
    <Show when={groups().length > 0} fallback={<p class={styles.note}>{notice()}</p>}>
      <div class={styles.groups}>
        <For each={groups()}>
          {(group) => (
            <section>
              <h3 class={styles.heading}>{GROUP_HEADINGS[group.kind][props.locale]}</h3>
              <ul class={styles.list}>
                <For each={group.recordings}>
                  {(listed) => (
                    <li>
                      <Entry listed={listed} locale={props.locale} />
                    </li>
                  )}
                </For>
              </ul>
            </section>
          )}
        </For>
      </div>
    </Show>
  );
}
