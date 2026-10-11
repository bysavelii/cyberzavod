// The recordings of the project that `cyberzavod view` serves: the list loads once, the factory
// floor, the log and the list panel read one store. The human picks which recording plays.

import { atom, computed, type ReadableAtom } from "nanostores";
import type { SessionRecord } from "@cyberzavod/core";
import { fetchLocalRecordings, type LocalRecordings } from "@/entities/recording-file";
import { LOADING, settle, type Remote } from "@/shared/api/remote.ts";

/** The group a recording belongs to: a build of a session draft or a published recording. */
export type RecordingKind = "draft" | "published";

/** Where a recording stands: its group and its place in the group's list. */
export interface RecordingPlace {
  readonly kind: RecordingKind;
  readonly index: number;
}

/** The local recordings: the stores and the actions that open and choose them. */
export interface LocalRecordingsModel {
  /** The list from the server: loading, ready, or why it cannot be shown. */
  readonly $recordings: ReadableAtom<Remote<LocalRecordings>>;
  /** Where the recording on the floor stands; none while there is nothing to play. */
  readonly $chosenPlace: ReadableAtom<RecordingPlace | undefined>;
  /** The recording on the floor: the one the human chose, by default the newest draft. */
  readonly $chosenRecording: ReadableAtom<SessionRecord | undefined>;
  /**
   * Loads the list. A repeated call sends no second request.
   * @returns {Promise<void>} When the list is received or it is clear why it is missing.
   */
  open(): Promise<void>;
  /**
   * Puts a recording on the floor.
   * @param {RecordingKind} kind The group of the recording.
   * @param {number} index Place of the recording in the group's list.
   */
  choose(kind: RecordingKind, index: number): void;
}

function recordsOf(recordings: LocalRecordings, kind: RecordingKind): readonly SessionRecord[] {
  return kind === "draft" ? recordings.drafts : recordings.published;
}

// A draft is the fresh work the human most likely wants to look at; without drafts, the newest
// recording.
function defaultPlace(recordings: LocalRecordings): RecordingPlace | undefined {
  if (recordings.drafts.length > 0) return { kind: "draft", index: 0 };

  if (recordings.published.length > 0) return { kind: "published", index: 0 };

  return undefined;
}

function isListed(recordings: LocalRecordings, place: RecordingPlace): boolean {
  return recordsOf(recordings, place.kind)[place.index] !== undefined;
}

/**
 * Creates the model of the local recordings.
 * @param {() => Promise<LocalRecordings>} fetchRecordings Request for the list.
 * @returns {LocalRecordingsModel} A model with the initial "loading" state.
 */
export function createLocalRecordingsModel(
  fetchRecordings: () => Promise<LocalRecordings>,
): LocalRecordingsModel {
  const $recordings = atom<Remote<LocalRecordings>>(LOADING);
  const $choice = atom<RecordingPlace | undefined>(undefined);
  let opening: Promise<void> | undefined;

  const $chosenPlace = computed([$recordings, $choice], (state, choice) => {
    if (state.status !== "ready") return undefined;

    const isChosenListed = choice !== undefined && isListed(state.value, choice);

    return isChosenListed ? choice : defaultPlace(state.value);
  });

  const $chosenRecording = computed([$recordings, $chosenPlace], (state, place) => {
    if (state.status !== "ready" || place === undefined) return undefined;

    return recordsOf(state.value, place.kind)[place.index];
  });

  return {
    $recordings,
    $chosenPlace,
    $chosenRecording,
    open: () => {
      opening ??= settle(fetchRecordings).then((state) => $recordings.set(state));

      return opening;
    },
    choose: (kind, index) => $choice.set({ kind, index }),
  };
}

const localRecordings = createLocalRecordingsModel(() => fetchLocalRecordings());

/** The local recordings and drafts: shared by the factory floor, the log and the list. */
export const $localRecordings = localRecordings.$recordings;

/** Where the recording on the floor stands in the list. */
export const $chosenPlace = localRecordings.$chosenPlace;

/** The recording on the floor. */
export const $chosenRecording = localRecordings.$chosenRecording;

/**
 * Loads the local recordings; the second island sends no second request.
 * @returns {Promise<void>} When the list is received or it is clear why it is missing.
 */
export function openLocalRecordings(): Promise<void> {
  return localRecordings.open();
}

/**
 * Puts a recording from the list on the floor.
 * @param {RecordingKind} kind The group of the recording.
 * @param {number} index Place of the recording in the group's list.
 */
export function chooseRecording(kind: RecordingKind, index: number): void {
  localRecordings.choose(kind, index);
}
