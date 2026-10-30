// Shared data for storage tests: temporary directories and validated records.

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { onTestFinished } from "vitest";
import type { DecisionRecord, ProjectConfig, SessionRecord } from "@cyberzavod/core";

/**
 * Creates an empty temporary directory for a test and deletes it when the test ends.
 * @returns {Promise<string>} Absolute directory path.
 */
export async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "cyberzavod-storage-"));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return directory;
}

/**
 * Project config for tests.
 * @param {Partial<ProjectConfig>} patch Fields to replace.
 * @returns {ProjectConfig} Config with the journal in the repository.
 */
export function validConfig(patch: Partial<ProjectConfig> = {}): ProjectConfig {
  return {
    projectId: "demo",
    harness: "0.3.0",
    workflow: "default",
    journal: "journal",
    agents: { claude: { planning: { provider: "anthropic", model: "default" } } },
    verification: { commands: ["pnpm test"], paths: ["src"] },
    ...patch,
  };
}

/**
 * Session for tests.
 * @param {string} id Record id.
 * @returns {SessionRecord} A session of a start and an end.
 */
export function validSession(id = "2026-10-07-demo"): SessionRecord {
  return {
    version: 1,
    type: "session",
    id,
    timestamp: "2026-10-07T10:00:00.000Z",
    projectId: "demo",
    source: { type: "agent", provider: "anthropic", agent: "claude" },
    data: {
      title: "Демо",
      language: "ru",
      workflow: "default",
      harness: "0.3.0",
      events: [
        { t: 0, type: "build_start" },
        { t: 10, type: "build_end", ok: true },
      ],
    },
  };
}

/**
 * Decision for tests.
 * @returns {DecisionRecord} A decision recorded by hand.
 */
export function validDecision(): DecisionRecord {
  return {
    version: 1,
    type: "decision",
    id: "use-indexeddb",
    timestamp: "2026-10-07T10:24:00.000Z",
    projectId: "demo",
    source: { type: "manual" },
    data: { title: "IndexedDB вместо localStorage", description: "Данные растут." },
  };
}
