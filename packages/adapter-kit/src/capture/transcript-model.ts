// What a draft takes from an agent's transcript. The model is the same for every agent; each
// adapter parses its own transcript format into these shapes.

import type { TokenBreakdown } from "@cyberzavod/core";

/** A model reply in the transcript: when it ended and which model replied. */
export interface ModelReply {
  /** When the reply ended: the calls and prompts before this moment belong to it. */
  ts: number;
  model: string;
}

/** Tokens of one model message: when it finished, which model spent them, and by kind. */
export interface TokenUsage {
  /** When the message ended; absent if the transcript does not say. */
  ts?: number;
  /** The model that replied; absent if the transcript does not say or it is a service reply. */
  model?: string;
  breakdown: TokenBreakdown;
}

/** Tokens of a model message whose end time is known: it can be placed between builds. */
export type TimedTokenUsage = TokenUsage & { ts: number };

/**
 * Checks that a message's end time is known.
 * @param {TokenUsage} usage Tokens of a model message.
 * @returns {usage is TimedTokenUsage} true if the message has a time.
 */
export function isTimedTokenUsage(usage: TokenUsage): usage is TimedTokenUsage {
  return usage.ts !== undefined;
}

/** Tokens a model spent in a run or in a stretch of the session, summed by kind. */
export interface ModelTokens {
  /** The model that spent the tokens; absent if unknown, and then the price is unknown too. */
  model?: string;
  /** The tokens by kind, summed. */
  breakdown: TokenBreakdown;
}

/** Model text in the transcript: when it was said and what it says. */
export interface TranscriptText {
  ts: number;
  text: string;
}

/** A task the session gave a subagent: to a new run (`spawn`) or by a message (`message`). */
export type AgentAssignment = { ts: number; text: string } & (
  { via: "spawn"; agentType: string; agentId?: string } | { via: "message"; agentId: string }
);

/** A subagent run's report: what it handed back to the session, when, and who it was. */
export interface AgentReport {
  ts: number;
  agentId: string;
  text: string;
}
