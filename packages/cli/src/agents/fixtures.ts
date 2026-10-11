// Shared data for tests: the adapters the way the CLI builds them.

import { tmpdir } from "node:os";
import path from "node:path";
import type { SessionRecord } from "@cyberzavod/core";
import type { AgentAdapter } from "./agent-adapter.ts";
import { claudeAdapter } from "./claude.ts";
import { createAdapters, type Adapters } from "./registry.ts";

/**
 * Adapters of all agents with the human's agent config in the given directory, so that a test
 * never touches the real one.
 * @param {string} codexHome Directory that stands in for `CODEX_HOME`.
 * @returns {Adapters} Adapters by agent name.
 */
export function adaptersWithCodexHome(codexHome: string): Adapters {
  return createAdapters({ env: { CODEX_HOME: codexHome }, homeDirectory: path.dirname(codexHome) });
}

// A directory that tests of other agents never create: a test that reaches the Codex config
// without its own home finds no file there.
const UNUSED_CODEX_HOME = path.join(tmpdir(), "cyberzavod-unused-codex-home", ".codex");

/** Adapters of all agents, built the way the CLI builds them, over a Codex home that is not used. */
export const adapters = adaptersWithCodexHome(UNUSED_CODEX_HOME);

/**
 * The Claude Code adapter whose drafts preview as the given recordings, for tests that need no
 * draft files.
 * @param {SessionRecord[]} builds What `previewDrafts` returns.
 * @returns {AgentAdapter} The adapter.
 */
export function adapterShowing(builds: SessionRecord[]): AgentAdapter {
  return { ...claudeAdapter, previewDrafts: () => Promise.resolve(builds) };
}

/**
 * Adapters of all agents in which Claude Code previews the given recordings as its drafts.
 * @param {SessionRecord[]} builds What the Claude Code adapter's `previewDrafts` returns.
 * @returns {Adapters} Adapters by agent name.
 */
export function adaptersShowing(builds: SessionRecord[]): Adapters {
  return { ...adapters, claude: adapterShowing(builds) };
}
