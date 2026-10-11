// Codex rollouts as the draft reads them: the shared reading of the files with this adapter's
// parsing of the format.

import {
  readTranscriptFile,
  transcriptsOf,
  type SessionTranscripts,
  type TranscriptRead,
  type TranscriptReader,
} from "@cyberzavod/adapter-kit";
import { access } from "node:fs/promises";
import { isNotFound } from "@cyberzavod/storage";
import {
  rolloutAnswers,
  rolloutAssignments,
  rolloutModelReplies,
  rolloutReports,
  rolloutTokenUsages,
  rolloutToolOutcomes,
} from "./rollout.ts";

// Codex may compress old rollouts next to where they were; the draft does not unpack them.
const COMPRESSED_SUFFIX = ".zst";

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);

    return true;
  } catch (err) {
    if (isNotFound(err)) return false;

    throw err;
  }
}

/**
 * Reads a rollout file; a rollout that exists only compressed is reported as such, not as lost.
 * @param {string} rolloutPath Path of the rollout.
 * @returns {Promise<TranscriptRead>} The text, or why there is none; a compressed file that cannot
 *   be looked up is a failure with the reason.
 */
export const readRollout: TranscriptReader = async (rolloutPath) => {
  const reading = await readTranscriptFile(rolloutPath);

  if (reading.status !== "missing") return reading;

  try {
    return (await exists(`${rolloutPath}${COMPRESSED_SUFFIX}`))
      ? { status: "compressed" }
      : reading;
  } catch (err) {
    return { status: "failed", reason: `compressed rollout lookup: ${String(err)}` };
  }
};

/** Codex rollouts for a recording draft. */
export const codexTranscripts: SessionTranscripts = transcriptsOf(
  {
    tokenUsages: rolloutTokenUsages,
    modelReplies: rolloutModelReplies,
    assistantTexts: rolloutAnswers,
    agentAssignments: rolloutAssignments,
    agentReports: rolloutReports,
    toolOutcomes: rolloutToolOutcomes,
  },
  readRollout,
);
