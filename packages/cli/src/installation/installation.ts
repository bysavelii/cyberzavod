// The running Cyberzavod version: version, harness and templates.

import type { ClaudeTemplates } from "@cyberzavod/adapter-claude";
import type { CodexTemplates } from "@cyberzavod/adapter-codex";
import type { RecordingFragments } from "@cyberzavod/adapter-kit";
import { parseHarness, type Harness, type HarnessError } from "@cyberzavod/core";
import { readAssets } from "./assets.ts";

/**
 * Cyberzavod version: this CLI sets it in the project config; it is also the npm package version.
 */
export const HARNESS_VERSION = "0.10.0";

const RULES_TEMPLATE = "cli/rules.md";

/** The running Cyberzavod version. */
export interface Installation {
  harness: Harness;
  /** AGENTS.md starter for a new project. */
  rulesTemplate: string;
  claudeTemplates: ClaudeTemplates;
  codexTemplates: CodexTemplates;
}

function recordingFragments(templates: Readonly<Record<string, string>>): RecordingFragments {
  return {
    rules: template(templates, "kit/recording-rules.md"),
    editor: template(templates, "kit/recording-editor.md"),
  };
}

function template(templates: Readonly<Record<string, string>>, name: string): string {
  const text = templates[name];

  if (text === undefined) throw new Error(`installation has no template ${name}`);

  return text;
}

/**
 * Reads the running Cyberzavod version.
 * @returns {Promise<Installation>} Harness and templates.
 * @throws {HarnessError} If the installation's harness fails validation.
 */
export async function readInstallation(): Promise<Installation> {
  const { harness, templates } = await readAssets();

  return {
    harness: parseHarness(harness),
    rulesTemplate: template(templates, RULES_TEMPLATE),
    claudeTemplates: {
      publishRecording: template(templates, "claude/publish-recording.md"),
      recordingEditor: template(templates, "claude/recording-editor.md"),
      setup: template(templates, "claude/setup.md"),
      recordingFragments: recordingFragments(templates),
    },
    codexTemplates: {
      publishRecording: template(templates, "codex/publish-recording.md"),
      setup: template(templates, "codex/setup.md"),
      recordingFragments: recordingFragments(templates),
    },
  };
}
