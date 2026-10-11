import type { SessionRecord } from "@cyberzavod/core";

/** A recording in an author's gallery, the API `Summary`: no events, linked by `slug`. */
export interface RecordingSummary {
  readonly id: string;
  /** The secret part of the recording link: `/r/?id=<slug>`. */
  readonly slug: string;
  readonly projectId: string;
  readonly title: string;
  /** The recording's original language: an ISO 639 code. */
  readonly language: string;
  /** Build start, the recording's `timestamp`. */
  readonly startedAt: string;
  readonly uploadedAt: string;
}

/** An author's public gallery opened by its link: their recordings, newest first. */
export interface Gallery {
  readonly login: string;
  readonly recordings: readonly RecordingSummary[];
}

/** A recording by secret link: the session, its author and whether their gallery is public. */
export interface SharedRecording {
  readonly owner: string;
  readonly galleryPublic: boolean;
  readonly record: SessionRecord;
}

/**
 * The signed-in author's own gallery, the `GET /api/me` response: whether it is public, how many
 * recordings it can hold and the recordings themselves, including in a private gallery.
 */
export interface OwnGallery {
  readonly login: string;
  readonly galleryPublic: boolean;
  /** How many recordings fit in the gallery. */
  readonly limit: number;
  readonly recordings: readonly RecordingSummary[];
}
