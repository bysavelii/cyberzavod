// The Claude Code adapter as the CLI uses it: the adapter package's functions behind the CLI's
// `AgentAdapter` interface. This is the only file in the CLI that calls them.

import { KIT_MESSAGES, KitError, requireWritable } from "@cyberzavod/adapter-kit";
import {
  CLAUDE_AGENT,
  CLAUDE_MESSAGES,
  CLAUDE_PROVIDER,
  ClaudeError,
  disconnectClaude,
  draftSession,
  HOOK_NAMES,
  inspectClaudeHooks,
  isHookName,
  previewClaude,
  previewDrafts,
  publishSessions,
  runHook,
  SETTINGS_FILE,
  syncClaude,
  type ClaudeInstallation,
} from "@cyberzavod/adapter-claude";
import type { InterfaceLanguage } from "@cyberzavod/core";
import { claudeCodeCheck } from "../doctor/claude-code.ts";
import { CommandError } from "../errors.ts";
import type { Installation } from "../installation/installation.ts";
import type { AgentTerms } from "../messages/cli-messages.ts";
import type {
  AgentAdapter,
  AgentHooksReading,
  FilesRequest,
  HookRequest,
} from "./agent-adapter.ts";
import { draftOptionsOf, previewOptionsOf, publishOptionsOf } from "./session-requests.ts";

const CLAUDE_PROJECT_DIRECTORY = "CLAUDE_PROJECT_DIR";

const terms: AgentTerms = {
  product: "Claude Code",
  skill: (name) => `/${name}`,
};

function claudeInstallationOf(installation: Installation): ClaudeInstallation {
  return { harness: installation.harness, templates: installation.claudeTemplates };
}

async function inspectHooks(root: string, version: string): Promise<AgentHooksReading> {
  const reading = await inspectClaudeHooks(root, version);

  if (reading.kind !== "unreadable") return reading;

  const { error } = reading;

  return {
    kind: "unreadable",
    describe: (language) => error.describe(KIT_MESSAGES[language]),
  };
}

// Claude Code gives the hook the project directory in an environment variable: its working
// directory may be any subdirectory.
function hookProjectDirectory({ env, directory }: HookRequest): string {
  return env[CLAUDE_PROJECT_DIRECTORY] || directory;
}

function runClaudeHook(name: string, request: HookRequest) {
  if (!isHookName(name)) throw new CommandError((m) => m.errors.unknownHook(name));

  return runHook(name, {
    payload: request.payload,
    projectDirectory: hookProjectDirectory(request),
    tmpDir: request.tmpDir,
    messages: KIT_MESSAGES[request.language],
  });
}

function describeClaudeError(err: unknown, language: InterfaceLanguage): string | undefined {
  if (err instanceof ClaudeError) return err.describe(CLAUDE_MESSAGES[language]);

  return err instanceof KitError ? err.describe(KIT_MESSAGES[language]) : undefined;
}

/** Claude Code: `anthropic`/`claude`, files in `CLAUDE.md` and `.claude/`, hooks in the settings. */
export const claudeAdapter: AgentAdapter = {
  name: "claude",
  identity: { provider: CLAUDE_PROVIDER, agent: CLAUDE_AGENT },
  terms,
  hooksFile: SETTINGS_FILE,
  initFiles: ["CLAUDE.md", ".claude/"],
  legacyRulesFile: "CLAUDE.md",
  programCheck: claudeCodeCheck,
  extraProjectChecks: [],
  hookNames: HOOK_NAMES,
  userConfig: undefined,

  previewFiles: (planned, installation) =>
    previewClaude(planned, claudeInstallationOf(installation)),
  inspectFiles: (projectDirectory, installation) =>
    syncClaude({
      projectDirectory,
      installation: claudeInstallationOf(installation),
      check: true,
    }),
  syncFiles: ({ projectDirectory, installation, force }: FilesRequest) =>
    syncClaude({ projectDirectory, installation: claudeInstallationOf(installation), force }),
  requireWritable,
  inspectHooks,
  planDisconnect: (projectDirectory) => disconnectClaude({ projectDirectory, check: true }),
  disconnect: (projectDirectory) => disconnectClaude({ projectDirectory }),

  runHook: runClaudeHook,
  draftSession: (request) => draftSession(draftOptionsOf(request)),
  publishSessions: (request) => publishSessions(publishOptionsOf(request)),
  previewDrafts: (request) => previewDrafts(previewOptionsOf(request)),
  describeError: describeClaudeError,
};
