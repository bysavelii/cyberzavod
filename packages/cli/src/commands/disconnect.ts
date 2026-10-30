// `cyberzavod disconnect`: removes Cyberzavod from the project, only what it wrote itself.
// First shows the plan and asks "Continue?"; the code, AGENTS.md, the journal, the human's own
// settings and hooks stay.

import { rm } from "node:fs/promises";
import path from "node:path";
import { MANIFEST_FILE, type DisconnectPlan } from "@cyberzavod/adapter-kit";
import { LEGACY_TOOL_FILE, MARKER_DIRECTORY, PROJECT_CONFIG_FILE } from "@cyberzavod/storage";
import type { AgentAdapter, UserConfigChange, UserConfigPlan } from "../agents/agent-adapter.ts";
import { adapterFor } from "../agents/host-agent.ts";
import type { Adapters } from "../agents/registry.ts";
import type { Confirmation } from "../confirmation.ts";
import { removeDirectoryIfEmpty } from "../files.ts";
import type { CliMessages } from "../messages/cli-messages.ts";
import { captureIgnoreEntry } from "./gitignore.ts";
import { hasLegacyTool, removeLegacyTool } from "./legacy-tool.ts";
import { RULES_FILE } from "./init.ts";
import { requireProjectAt, type ProjectAt } from "./project.ts";

const LIST_INDENT = "  ";

/** What disconnecting needs: confirmation and texts. */
export interface DisconnectCommandOptions {
  /** Asks "Continue?", agrees without asking, or refuses. */
  confirm: Confirmation;
  messages: CliMessages;
  /** Adapters of the agents the CLI can drive. */
  adapters: Adapters;
}

/** Disconnect outcome: everything removed, or the human refused and nothing changed. */
export type DisconnectOutcome = "removed" | "cancelled";

function slashed(file: string): string {
  return file.split(path.sep).join("/");
}

function settingsLine(
  plan: DisconnectPlan,
  adapter: AgentAdapter,
  messages: CliMessages,
): string[] {
  switch (plan.settings) {
    case "unchanged":
      return [];
    case "updated":
      return [messages.disconnect.settingsUpdated(adapter.hooksFile)];
    case "removed":
      return [messages.disconnect.settingsRemoved(adapter.hooksFile)];
    default:
      return plan.settings satisfies never;
  }
}

function manifestLine(plan: DisconnectPlan): string[] {
  return plan.manifest === "unchanged" ? [] : [MANIFEST_FILE];
}

function takenBackLine(change: UserConfigChange, messages: CliMessages): string {
  switch (change.kind) {
    case "project":
      return messages.disconnect.untrustProject(change.file);
    case "hooks":
      return messages.disconnect.untrustHooks(change.file);
  }
}

interface RemovedLines {
  plan: DisconnectPlan;
  userConfigPlan: UserConfigPlan | undefined;
  adapter: AgentAdapter;
  hasLegacy: boolean;
  messages: CliMessages;
}

function removedLines({
  plan,
  userConfigPlan,
  adapter,
  hasLegacy,
  messages,
}: RemovedLines): string[] {
  const takenBack = (userConfigPlan?.changes ?? []).map((change) =>
    takenBackLine(change, messages),
  );

  return [
    ...plan.removed,
    ...manifestLine(plan),
    ...settingsLine(plan, adapter, messages),
    ...takenBack,
    ...(hasLegacy ? [LEGACY_TOOL_FILE] : []),
    slashed(PROJECT_CONFIG_FILE),
  ];
}

interface KeptLines {
  project: ProjectAt;
  plan: DisconnectPlan;
  userConfigPlan: UserConfigPlan | undefined;
  adapter: AgentAdapter;
  messages: CliMessages;
}

function keptLines({ project, plan, userConfigPlan, adapter, messages }: KeptLines): string[] {
  const { disconnect } = messages;
  const keptTrustFile = userConfigPlan?.keptProjectTrustFile;
  const journal = slashed(path.relative(project.root, project.journal));
  const ignoreEntry = captureIgnoreEntry(project.config.journal);
  const edited = plan.edited.map((file) => disconnect.editedFile(file));

  return [
    disconnect.keepSource,
    RULES_FILE,
    disconnect.keepJournal(journal),
    ...(ignoreEntry === undefined ? [] : [disconnect.keepIgnoreEntry(ignoreEntry)]),
    disconnect.keepSettings(adapter.terms),
    ...(keptTrustFile === undefined ? [] : [disconnect.keepProjectTrust(keptTrustFile)]),
    ...edited,
  ];
}

function printList(title: string, lines: readonly string[]): void {
  console.log(title);

  for (const line of lines) console.log(`${LIST_INDENT}${line}`);

  console.log("");
}

/**
 * Removes Cyberzavod from the project after the human agrees: agent files and their manifest, its
 * hooks and denials in the agent settings, the project config. The code, AGENTS.md, the
 * journal, the `.gitignore` line for raw logs and everything else in the settings stay.
 * @param {string} directory Directory inside the project.
 * @param {DisconnectCommandOptions} options Confirmation, texts and adapters.
 * @returns {Promise<DisconnectOutcome>} Removed or cancelled.
 * @throws {Error} If the directory is not in a project.
 * @throws {Error} If the settings or the agent's own config do not parse: then nothing is changed.
 */
export async function disconnectProject(
  directory: string,
  options: DisconnectCommandOptions,
): Promise<DisconnectOutcome> {
  const { confirm, messages, adapters } = options;
  const project = await requireProjectAt(directory);
  const adapter = adapterFor(project.config, adapters);
  const plan = await adapter.planDisconnect(project.root);
  const userConfigPlan = await adapter.userConfig?.planDisconnect(project.root);
  const hasLegacy = await hasLegacyTool(project.root);
  const removed = removedLines({ plan, userConfigPlan, adapter, hasLegacy, messages });

  printList(messages.disconnect.willRemove, removed);
  printList(
    messages.disconnect.willKeep,
    keptLines({ project, plan, userConfigPlan, adapter, messages }),
  );

  const isConfirmed = await confirm(messages.disconnect.confirm);

  if (!isConfirmed) {
    console.log(messages.disconnect.cancelled);

    return "cancelled";
  }

  await userConfigPlan?.apply();
  await adapter.disconnect(project.root);

  if (hasLegacy) await removeLegacyTool(project.root);

  await rm(path.join(project.root, PROJECT_CONFIG_FILE), { force: true });
  await removeDirectoryIfEmpty(path.join(project.root, MARKER_DIRECTORY));
  console.log(
    messages.disconnect.done({
      rulesFile: RULES_FILE,
      terms: adapter.terms,
      agentRulesFile: adapter.legacyRulesFile,
    }),
  );

  return "removed";
}
