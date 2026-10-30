// `cyberzavod disconnect`: removes Cyberzavod from the project, only what it wrote itself.
// First shows the plan and asks "Continue?"; the code, AGENTS.md, the journal, the human's own
// settings and hooks stay.

import { rm } from "node:fs/promises";
import path from "node:path";
import { MANIFEST_FILE, type DisconnectPlan } from "@cyberzavod/adapter-kit";
import { LEGACY_TOOL_FILE, MARKER_DIRECTORY, PROJECT_CONFIG_FILE } from "@cyberzavod/storage";
import type { AgentAdapter, UserConfigChange, UserConfigPlan } from "../agents/agent-adapter.ts";
import { connectedAdaptersOf } from "../agents/host-agent.ts";
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

function manifestLine(plans: readonly AgentPlan[]): string[] {
  const isTouched = plans.some(({ plan }) => plan.manifest !== "unchanged");

  return isTouched ? [MANIFEST_FILE] : [];
}

function takenBackLine(change: UserConfigChange, messages: CliMessages): string {
  switch (change.kind) {
    case "project":
      return messages.disconnect.untrustProject(change.file);
    case "hooks":
      return messages.disconnect.untrustHooks(change.file);
  }
}

/** What disconnecting one agent does: the adapter, its plan and its part of the human's config. */
interface AgentPlan {
  adapter: AgentAdapter;
  plan: DisconnectPlan;
  userConfigPlan: UserConfigPlan | undefined;
}

async function planOf(adapter: AgentAdapter, root: string): Promise<AgentPlan> {
  const plan = await adapter.planDisconnect(root);
  const userConfigPlan = await adapter.userConfig?.planDisconnect(root);

  return { adapter, plan, userConfigPlan };
}

function removedByAgent({ adapter, plan, userConfigPlan }: AgentPlan, messages: CliMessages) {
  const takenBack = (userConfigPlan?.changes ?? []).map((change) =>
    takenBackLine(change, messages),
  );

  return [...plan.removed, ...settingsLine(plan, adapter, messages), ...takenBack];
}

interface RemovedLines {
  plans: readonly AgentPlan[];
  hasLegacy: boolean;
  messages: CliMessages;
}

function removedLines({ plans, hasLegacy, messages }: RemovedLines): string[] {
  return [
    ...plans.flatMap((agentPlan) => removedByAgent(agentPlan, messages)),
    ...manifestLine(plans),
    ...(hasLegacy ? [LEGACY_TOOL_FILE] : []),
    slashed(PROJECT_CONFIG_FILE),
  ];
}

interface KeptLines {
  project: ProjectAt;
  plans: readonly AgentPlan[];
  messages: CliMessages;
}

function keptByAgent({ adapter, plan, userConfigPlan }: AgentPlan, messages: CliMessages) {
  const { disconnect } = messages;
  const keptTrustFile = userConfigPlan?.keptProjectTrustFile;

  return [
    disconnect.keepSettings(adapter.terms),
    ...(keptTrustFile === undefined ? [] : [disconnect.keepProjectTrust(keptTrustFile)]),
    ...plan.edited.map((file) => disconnect.editedFile(file)),
  ];
}

function keptLines({ project, plans, messages }: KeptLines): string[] {
  const { disconnect } = messages;
  const journal = slashed(path.relative(project.root, project.journal));
  const ignoreEntry = captureIgnoreEntry(project.config.journal);

  return [
    disconnect.keepSource,
    RULES_FILE,
    disconnect.keepJournal(journal),
    ...(ignoreEntry === undefined ? [] : [disconnect.keepIgnoreEntry(ignoreEntry)]),
    ...plans.flatMap((agentPlan) => keptByAgent(agentPlan, messages)),
  ];
}

function printList(title: string, lines: readonly string[]): void {
  console.log(title);

  for (const line of lines) console.log(`${LIST_INDENT}${line}`);

  console.log("");
}

// An agent that reads its own rules file does not see AGENTS.md once Cyberzavod is gone.
function printAgentRulesHints(plans: readonly AgentPlan[], messages: CliMessages): void {
  for (const { adapter } of plans) {
    const { legacyRulesFile } = adapter;

    if (legacyRulesFile === undefined) continue;

    const hint = messages.disconnect.agentRulesHint({
      rulesFile: RULES_FILE,
      terms: adapter.terms,
      agentRulesFile: legacyRulesFile,
    });

    console.log(hint);
  }
}

/**
 * Removes Cyberzavod from the project after the human agrees: the files of every connected agent
 * and the manifest, their hooks and denials in the agent settings, the project config. The code,
 * AGENTS.md, the journal, the `.gitignore` line for raw logs and everything else in the settings
 * stay.
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
  const connected = connectedAdaptersOf(project.config, adapters);
  const plans = await Promise.all(connected.map((adapter) => planOf(adapter, project.root)));
  const hasLegacy = await hasLegacyTool(project.root);

  printList(messages.disconnect.willRemove, removedLines({ plans, hasLegacy, messages }));
  printList(messages.disconnect.willKeep, keptLines({ project, plans, messages }));

  const isConfirmed = await confirm(messages.disconnect.confirm);

  if (!isConfirmed) {
    console.log(messages.disconnect.cancelled);

    return "cancelled";
  }

  for (const { adapter, userConfigPlan } of plans) {
    await userConfigPlan?.apply();
    await adapter.disconnect(project.root);
  }

  if (hasLegacy) await removeLegacyTool(project.root);

  await rm(path.join(project.root, PROJECT_CONFIG_FILE), { force: true });
  await removeDirectoryIfEmpty(path.join(project.root, MARKER_DIRECTORY));

  console.log(messages.disconnect.done);
  printAgentRulesHints(plans, messages);

  return "removed";
}
