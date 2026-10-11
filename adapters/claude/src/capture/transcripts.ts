// Claude Code transcripts as the draft reads them: the shared reading of the files with this
// adapter's parsing of the format.

import { transcriptsOf, type SessionTranscripts } from "@cyberzavod/adapter-kit";
import {
  agentAssignments,
  agentReports,
  assistantTexts,
  modelReplies,
  tokenUsages,
} from "./transcript.ts";

/** Claude Code transcripts for a recording draft. */
export const claudeTranscripts: SessionTranscripts = transcriptsOf({
  tokenUsages,
  modelReplies,
  assistantTexts,
  agentAssignments,
  agentReports,
});
