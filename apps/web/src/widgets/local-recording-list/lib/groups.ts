import type { SessionRecord } from "@cyberzavod/core";
import type { LocalRecordings } from "@/entities/recording-file";
import type { RecordingKind, RecordingPlace } from "@/features/local-recordings";

/** A recording of the list with the place that puts it on the floor. */
export interface ListedRecording {
  readonly place: RecordingPlace;
  readonly record: SessionRecord;
}

/** The list's group: drafts or published recordings. */
export interface RecordingGroup {
  readonly kind: RecordingKind;
  readonly recordings: readonly ListedRecording[];
}

function listedIn(
  kind: RecordingKind,
  records: readonly SessionRecord[],
): readonly ListedRecording[] {
  return records.map((record, index) => ({ place: { kind, index }, record }));
}

/**
 * Splits the local recordings into the list's groups: drafts first, as the fresh work, then the
 * published recordings. An empty group is left out.
 * @param {LocalRecordings} recordings The recordings and drafts of the project.
 * @returns {readonly RecordingGroup[]} Groups in display order.
 */
export function groupsOf(recordings: LocalRecordings): readonly RecordingGroup[] {
  const groups: RecordingGroup[] = [
    { kind: "draft", recordings: listedIn("draft", recordings.drafts) },
    { kind: "published", recordings: listedIn("published", recordings.published) },
  ];

  return groups.filter((group) => group.recordings.length > 0);
}

/**
 * Whether a listed recording is the one on the floor.
 * @param {ListedRecording} listed A recording of the list.
 * @param {RecordingPlace | undefined} chosen The place of the recording on the floor.
 * @returns {boolean} `true` if it is the chosen one.
 */
export function isChosen(listed: ListedRecording, chosen: RecordingPlace | undefined): boolean {
  return chosen?.kind === listed.place.kind && chosen.index === listed.place.index;
}
