import { createEffect, on, onMount, Show, untrack, type JSX } from "solid-js";
import { briefOf, type SessionRecord } from "@cyberzavod/core";
import {
  $chosenRecording,
  $localRecordings,
  noticeOf,
  openLocalRecordings,
} from "@/features/local-recordings";
import type { Locale } from "@/shared/i18n/locale.ts";
import { UI_TEXT } from "@/shared/i18n/ui-text.ts";
import { languageNoteOf } from "@/shared/lib/language-note.ts";
import { useStoreValue } from "@/shared/lib/use-store-value.ts";
import { Panel } from "@/shared/ui";
import type { BuildProject } from "../lib/build-project.ts";
import { createFactoryModel } from "../model/factory.ts";
import { FactoryFloor } from "./FactoryFloor.tsx";

interface Props {
  /** Page language: floor captions and messages are in it. */
  locale: Locale;
}

interface FloorProps extends Props {
  /** The recording on the floor; the floor stays when it changes. */
  record: SessionRecord;
}

// A local recording has no project card and no address: the HUD names the project by its id.
function projectOf(record: SessionRecord): BuildProject {
  return { name: record.projectId, url: undefined };
}

// The model is created once on the first recording; a new choice loads into it, so the canvas and
// the graphics stay.
function LocalFloor(props: FloorProps): JSX.Element {
  const model = createFactoryModel(briefOf(untrack(() => props.record)));

  createEffect(
    on(
      () => props.record,
      (next) => model.load(briefOf(next)),
      { defer: true },
    ),
  );

  return (
    <FactoryFloor
      model={model}
      locale={props.locale}
      project={projectOf(props.record)}
      languageNote={languageNoteOf(props.record.data.language, props.locale)}
      position={undefined}
      titleLevel="h1"
    />
  );
}

/**
 * Factory of `cyberzavod view`: plays the recording the human chose among the project's own
 * recordings and drafts. The list comes from the local server in the browser; until there is a
 * recording to play, a message in the field says why.
 * @param {Props} props Component props.
 * @param {Locale} props.locale Page language.
 * @returns {JSX.Element} The factory with the HUD, or a message.
 */
export function LocalFactory(props: Props): JSX.Element {
  const state = useStoreValue($localRecordings);
  const chosen = useStoreValue($chosenRecording);

  onMount(() => void openLocalRecordings());

  return (
    <Show
      when={chosen()}
      fallback={
        <Panel label={UI_TEXT.pages.floor[props.locale]}>
          <p>{noticeOf(state(), props.locale)}</p>
        </Panel>
      }
    >
      {(record) => <LocalFloor locale={props.locale} record={record()} />}
    </Show>
  );
}
