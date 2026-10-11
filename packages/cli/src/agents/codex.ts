// The Codex adapter as the CLI uses it: the adapter package's functions behind the CLI's
// `AgentAdapter` interface. This is the only file in the CLI that calls them.

import { isObject, KIT_MESSAGES, KitError, requireWritable } from "@cyberzavod/adapter-kit";
import {
  carryOverTrust,
  CODEX_AGENT,
  CODEX_HOOK_NAMES,
  CODEX_MESSAGES,
  CODEX_PROVIDER,
  CodexError,
  disconnectCodex,
  draftSession,
  HOOKS_FILE,
  inspectCodexHooks,
  inspectTrust,
  isCodexHookName,
  planConnectTrust,
  planDisconnectTrust,
  previewCodex,
  previewDrafts,
  publishSessions,
  runCodexHook,
  syncCodex,
  type CodexHomeSource,
  type CodexInstallation,
  type TrustInspection,
} from "@cyberzavod/adapter-codex";
import type { InterfaceLanguage } from "@cyberzavod/core";
import { codexCheck } from "../doctor/codex.ts";
import { trustCheckFor } from "../doctor/trust.ts";
import { CommandError } from "../errors.ts";
import type { Installation } from "../installation/installation.ts";
import type { AgentTerms } from "../messages/cli-messages.ts";
import type {
  AgentAdapter,
  AgentHooksReading,
  FilesRequest,
  HookRequest,
  UserConfigAccess,
  UserConfigReading,
} from "./agent-adapter.ts";
import { draftOptionsOf, previewOptionsOf, publishOptionsOf } from "./session-requests.ts";

const terms: AgentTerms = {
  product: "Codex",
  skill: (name) => `$${name}`,
};

function codexInstallationOf(installation: Installation): CodexInstallation {
  return { harness: installation.harness, templates: installation.codexTemplates };
}

async function inspectHooks(root: string, version: string): Promise<AgentHooksReading> {
  const reading = await inspectCodexHooks(root, version);

  if (reading.kind !== "unreadable") return reading;

  const { error } = reading;

  return {
    kind: "unreadable",
    describe: (language) => error.describe(KIT_MESSAGES[language]),
  };
}

function readingOf(inspection: TrustInspection): UserConfigReading {
  switch (inspection.kind) {
    case "trusted":
      return { kind: "ready", file: inspection.file };
    case "projectUntrusted":
    case "hooksUntrusted":
      return inspection;

    case "unreadable": {
      const { error } = inspection;

      return {
        kind: "unreadable",
        describe: (language) =>
          error instanceof KitError
            ? error.describe(KIT_MESSAGES[language])
            : error.describe(CODEX_MESSAGES[language]),
      };
    }
  }
}

function userConfigOf(source: CodexHomeSource): UserConfigAccess {
  return {
    planConnect: (target) => planConnectTrust(source, target),
    carryOver: (root, action) => carryOverTrust(source, root, action),
    inspect: async (root) => readingOf(await inspectTrust(source, root)),
    planDisconnect: (root) => planDisconnectTrust(source, root),
  };
}

// Codex starts a hook in the session directory and gives it no variable with the project root, so
// the payload's `cwd` is the place to look from; the adapter walks up from there to the project.
function hookProjectDirectory({ payload, directory }: HookRequest): string {
  const parsed: unknown = JSON.parse(payload);
  const cwd = isObject(parsed) ? parsed.cwd : undefined;

  return typeof cwd === "string" && cwd !== "" ? cwd : directory;
}

function runCodexHookByName(name: string, request: HookRequest) {
  if (!isCodexHookName(name)) throw new CommandError((m) => m.errors.unknownHook(name));

  return runCodexHook(name, {
    payload: request.payload,
    projectDirectory: hookProjectDirectory(request),
    tmpDir: request.tmpDir,
    messages: KIT_MESSAGES[request.language],
    guardMessages: CODEX_MESSAGES[request.language].guard,
  });
}

function describeCodexError(err: unknown, language: InterfaceLanguage): string | undefined {
  if (err instanceof CodexError) return err.describe(CODEX_MESSAGES[language]);

  return err instanceof KitError ? err.describe(KIT_MESSAGES[language]) : undefined;
}

/**
 * Codex: `openai`/`codex`, files in `.codex/` and `.agents/skills/`, hooks in `.codex/hooks.json`,
 * trust in the human's own `config.toml`.
 * @param {CodexHomeSource} source Environment and home directory, which tell where the human's
 *   Codex config is.
 * @returns {AgentAdapter} The Codex adapter.
 */
export function createCodexAdapter(source: CodexHomeSource): AgentAdapter {
  const userConfig = userConfigOf(source);

  return {
    name: "codex",
    identity: { provider: CODEX_PROVIDER, agent: CODEX_AGENT },
    terms,
    hooksFile: HOOKS_FILE,
    initFiles: [".codex/", ".agents/skills/"],
    legacyRulesFile: undefined,
    programCheck: codexCheck,
    extraProjectChecks: [trustCheckFor(userConfig, terms)],
    hookNames: CODEX_HOOK_NAMES,
    userConfig,

    previewFiles: (planned, installation) =>
      previewCodex(planned, codexInstallationOf(installation)),
    inspectFiles: (projectDirectory, installation) =>
      syncCodex({
        projectDirectory,
        installation: codexInstallationOf(installation),
        check: true,
      }),
    syncFiles: ({ projectDirectory, installation, force }: FilesRequest) =>
      syncCodex({ projectDirectory, installation: codexInstallationOf(installation), force }),
    requireWritable,
    inspectHooks,
    planDisconnect: (projectDirectory) => disconnectCodex({ projectDirectory, check: true }),
    disconnect: (projectDirectory) => disconnectCodex({ projectDirectory }),

    runHook: runCodexHookByName,
    draftSession: (request) => draftSession(draftOptionsOf(request)),
    publishSessions: (request) => publishSessions(publishOptionsOf(request)),
    previewDrafts: (request) => previewDrafts(previewOptionsOf(request)),
    describeError: describeCodexError,
  };
}
