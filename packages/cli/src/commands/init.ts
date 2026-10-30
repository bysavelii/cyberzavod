// `cyberzavod init`: connects the project in the current directory: shows what was found and what
// will appear, asks a single "Continue?", writes the config, AGENTS.md and agent files. The project
// stays where it is: Cyberzavod neither clones nor moves it.

import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PlannedProject, SyncReport } from "@cyberzavod/adapter-kit";
import { RULES_TODO_MARK, type ProjectConfig } from "@cyberzavod/core";
import { PROJECT_CONFIG_FILE, readProjectConfig, writeProjectConfig } from "@cyberzavod/storage";
import {
  DEFAULT_AGENT_NAME,
  type AgentAdapter,
  type AgentName,
  type UserConfigChange,
  type UserConfigPlan,
} from "../agents/agent-adapter.ts";
import { agentNamed, connectedAdaptersOf } from "../agents/host-agent.ts";
import type { Adapters } from "../agents/registry.ts";
import type { Confirmation } from "../confirmation.ts";
import { detectProject } from "../detect.ts";
import { CommandError } from "../errors.ts";
import { readOptionalText } from "../files.ts";
import { initialConfigOf, stageAgentsOf, type InitOverrides } from "../initial-config.ts";
import { HARNESS_VERSION, type Installation } from "../installation/installation.ts";
import type { CliMessages } from "../messages/cli-messages.ts";
import { appendIgnoreEntry, captureIgnoreEntry, GITIGNORE_FILE } from "./gitignore.ts";
import { requireProjectAt, type ProjectAt } from "./project.ts";
import { filesStatusOf, inspectProjectFiles } from "./sync.ts";

/** The project's rules file for agents, in its root. */
export const RULES_FILE = "AGENTS.md";
const SUMMARY_INDENT = "  ";
const LIST_SEPARATOR = ", ";
const PATH_SEPARATORS = /[\\/]/;
const TODO_PLACEHOLDER = "{{todo}}";

function starterRules(template: string, name: string, commands: string[]): string {
  const verification =
    commands.length === 0
      ? `  - not set yet ${RULES_TODO_MARK}`
      : commands.map((command) => `  - \`${command}\``).join("\n");

  return template
    .replace("{{name}}", name)
    .replace("{{verification}}", verification)
    .replaceAll(TODO_PLACEHOLDER, RULES_TODO_MARK);
}

// What happens to the project rules: AGENTS.md already exists and is not changed; a rules file
// written by the human for the agent (for Claude Code, CLAUDE.md) is the rules, so it moves to
// AGENTS.md, and a thin generated file takes its place; otherwise AGENTS.md is written from the
// starter.
type RulesPlan = { kind: "kept" } | { kind: "moved"; from: string } | { kind: "starter" };

async function planRules(root: string, adapter: AgentAdapter): Promise<RulesPlan> {
  const hasRules = (await readOptionalText(path.join(root, RULES_FILE))) !== undefined;

  if (hasRules) return { kind: "kept" };

  const { legacyRulesFile } = adapter;

  if (legacyRulesFile === undefined) return { kind: "starter" };

  const hasLegacyRules = (await readOptionalText(path.join(root, legacyRulesFile))) !== undefined;

  return hasLegacyRules ? { kind: "moved", from: legacyRulesFile } : { kind: "starter" };
}

function rulesSummary(plan: RulesPlan, messages: CliMessages): string {
  switch (plan.kind) {
    case "kept":
      return messages.init.rulesKept(RULES_FILE);
    case "moved":
      return messages.init.rulesMoved({ from: plan.from, to: RULES_FILE });
    case "starter":
      return messages.init.rulesStarter(RULES_FILE);
    default:
      return plan satisfies never;
  }
}

interface RulesApplication {
  root: string;
  plan: RulesPlan;
  template: string;
  name: string;
  commands: string[];
}

async function applyRules({
  root,
  plan,
  template,
  name,
  commands,
}: RulesApplication): Promise<void> {
  const rules = path.join(root, RULES_FILE);

  switch (plan.kind) {
    case "kept":
      return;
    case "moved":
      await rename(path.join(root, plan.from), rules);

      return;
    case "starter":
      await writeFile(rules, starterRules(template, name, commands));

      return;
    default:
      return plan satisfies never;
  }
}

function slashed(file: string): string {
  return file.split(PATH_SEPARATORS).join("/");
}

// Files that will appear are named the way the human will see them: the project and the agent,
// without listing their contents.
function createdFiles(adapter: AgentAdapter, ignoreEntry: string | undefined): string[] {
  const files = [slashed(PROJECT_CONFIG_FILE), ...adapter.initFiles];

  return ignoreEntry === undefined ? files : [...files, GITIGNORE_FILE];
}

function trustLine(change: UserConfigChange, messages: CliMessages): string {
  switch (change.kind) {
    case "project":
      return messages.init.trustProject(change.file);
    case "hooks":
      return messages.init.trustHooks(change.file);
  }
}

interface Summary {
  config: ProjectConfig;
  adapter: AgentAdapter;
  rulesPlan: RulesPlan;
  ignoreEntry: string | undefined;
  userConfigPlan: UserConfigPlan | undefined;
  messages: CliMessages;
}

function printSummary(summary: Summary): void {
  const { config, adapter, rulesPlan, ignoreEntry, userConfigPlan, messages } = summary;
  const { init } = messages;
  const checks =
    config.verification.commands.length === 0
      ? init.checksMissing({ file: slashed(PROJECT_CONFIG_FILE), terms: adapter.terms })
      : init.checks(config.verification.commands.join(LIST_SEPARATOR));
  const trust = (userConfigPlan?.changes ?? []).map((change) => trustLine(change, messages));
  const details = [
    init.projectId(config.projectId),
    checks,
    rulesSummary(rulesPlan, messages),
    init.journal(config.journal),
    init.files(createdFiles(adapter, ignoreEntry).join(LIST_SEPARATOR)),
    ...trust,
  ];

  console.log(init.summaryTitle);

  for (const detail of details) console.log(`${SUMMARY_INDENT}${detail}`);

  console.log(init.overrideHint);
}

// Each path collapses to its top element: `.claude/agents/planner.md` → `.claude/`.
function topLevelEntry(file: string): string {
  const [first = file, ...rest] = file.split(PATH_SEPARATORS);

  return rest.length === 0 ? first : `${first}/`;
}

function commitPaths(files: readonly string[]): string[] {
  const entries = files.map(topLevelEntry);

  return [...new Set(entries)];
}

interface Done {
  changed: readonly string[];
  isRulesFileWritten: boolean;
  isIgnoreEntryAdded: boolean;
  adapter: AgentAdapter;
  messages: CliMessages;
}

function printDone({
  changed,
  isRulesFileWritten,
  isIgnoreEntryAdded,
  adapter,
  messages,
}: Done): void {
  const files = [
    PROJECT_CONFIG_FILE,
    ...(isRulesFileWritten ? [RULES_FILE] : []),
    ...changed,
    ...(isIgnoreEntryAdded ? [GITIGNORE_FILE] : []),
  ];
  const paths = commitPaths(files).join(LIST_SEPARATOR);

  console.log(
    `\n${messages.init.done}\n${messages.init.commit(paths)}\n${messages.init.nextSteps(adapter.terms)}`,
  );
}

/** What connecting a project needs: confirmation, flags, Cyberzavod version and texts. */
export interface InitOptions {
  /** Asks "Continue?" or agrees without asking. */
  confirm: Confirmation;
  /** `init` flag values: they override what was found. */
  overrides: InitOverrides;
  /** The running Cyberzavod version. */
  installation: Installation;
  /** Messages in the chosen language. */
  messages: CliMessages;
  /** Adapters of the agents the CLI can drive. */
  adapters: Adapters;
  /** `--agent`: the agent that will drive the project; without it, the default one. */
  agent?: string | undefined;
}

function requestedAgentOf(agent: string | undefined): AgentName | undefined {
  return agent === undefined ? undefined : agentNamed(agent);
}

// Files the generator would write over are looked for before the first write: so a refusal leaves
// the project untouched. A handwritten rules file of the agent that will become AGENTS.md is not in
// the way.
async function blockingFiles(
  planned: PlannedProject,
  adapter: AgentAdapter,
  movedRulesFile: string | undefined,
  installation: Installation,
): Promise<string[]> {
  const report = await adapter.previewFiles(planned, installation);
  const blocked = [...report.conflicts, ...report.edited];

  return blocked.filter((file) => file !== movedRulesFile);
}

function requireNothingBlocked(blocked: readonly string[]): void {
  if (blocked.length === 0) return;

  const files = blocked.join(LIST_SEPARATOR);

  throw new CommandError((m) => m.errors.initBlocked({ files, rulesFile: RULES_FILE }));
}

// A project without agents in its config is driven by the default one: it stays connected when
// another is added.
function configWithAgent(
  config: ProjectConfig,
  adapter: AgentAdapter,
  options: Pick<InitOptions, "installation" | "adapters">,
): ProjectConfig {
  const { installation, adapters } = options;
  const stagesOf = (agent: AgentAdapter) =>
    stageAgentsOf(installation.harness, config.workflow, agent.identity);
  const isImplicit = Object.keys(config.agents).length === 0;
  const defaultAgent = adapters[DEFAULT_AGENT_NAME];
  const current = isImplicit ? { [defaultAgent.name]: stagesOf(defaultAgent) } : config.agents;

  return { ...config, agents: { ...current, [adapter.name]: stagesOf(adapter) } };
}

function printAddAgentSummary(
  adapter: AgentAdapter,
  userConfigPlan: UserConfigPlan | undefined,
  messages: CliMessages,
): void {
  const { init } = messages;
  const trust = (userConfigPlan?.changes ?? []).map((change) => trustLine(change, messages));
  const details = [init.files(adapter.initFiles.join(LIST_SEPARATOR)), ...trust];

  console.log(init.addAgentTitle(adapter.terms));

  for (const detail of details) console.log(`${SUMMARY_INDENT}${detail}`);
}

// Adding an agent to a project of another Cyberzavod version would mix templates and hook
// versions; sync brings the project to this version first.
function requireCurrentHarness(config: ProjectConfig, adapter: AgentAdapter): void {
  const configVersion = config.harness;

  if (configVersion === HARNESS_VERSION) return;

  throw new CommandError((m) =>
    m.errors.addAgentNeedsSync({
      file: slashed(PROJECT_CONFIG_FILE),
      configVersion,
      cliVersion: HARNESS_VERSION,
      agent: adapter.name,
    }),
  );
}

// The config goes first, as in sync: the generator reads the agent's stages from it. If the
// agent's files fail, only the config goes back to its previous text: files already written stay
// and are the agent's own by the manifest, so a repeated init --agent picks them up.
async function syncFilesOfAddedAgent(
  root: string,
  config: ProjectConfig,
  adapter: AgentAdapter,
  installation: Installation,
): Promise<SyncReport> {
  const configFile = path.join(root, PROJECT_CONFIG_FILE);
  const previousConfigText = await readFile(configFile, "utf8");

  await writeProjectConfig(root, config);

  try {
    return await adapter.syncFiles({ projectDirectory: root, installation, force: false });
  } catch (err) {
    // The failure of the files is the cause the human needs, even if the rollback fails too.
    await writeFile(configFile, previousConfigText).catch(() => undefined);

    throw err;
  }
}

// One more agent in a connected project: its files and trust, and its entry in the config. The
// files of the connected agents are not touched, hand edits included: with the harness current,
// their manifest sections are already in the format the new agent adds its own section to.
async function addAgent(
  project: ProjectAt,
  adapter: AgentAdapter,
  options: InitOptions,
): Promise<boolean> {
  const { confirm, installation, messages } = options;
  const { root } = project;

  requireCurrentHarness(project.config, adapter);

  const config = configWithAgent(project.config, adapter, options);
  const blocked = await blockingFiles({ root, config }, adapter, undefined, installation);

  requireNothingBlocked(blocked);

  const userConfigPlan = await adapter.userConfig?.planConnect({ root, version: config.harness });

  printAddAgentSummary(adapter, userConfigPlan, messages);

  const isConfirmed = await confirm(messages.init.confirm);

  if (!isConfirmed) {
    console.log(messages.init.cancelled);

    return true;
  }

  const report = await syncFilesOfAddedAgent(root, config, adapter, installation);

  await userConfigPlan?.apply();

  printDone({
    changed: [...report.added, ...report.updated],
    isRulesFileWritten: false,
    isIgnoreEntryAdded: false,
    adapter,
    messages,
  });

  return true;
}

// `init` does not change an already connected project, except to add the agent `--agent` names;
// otherwise it says whether the project is fine and what to do next.
async function reportConnected(
  root: string,
  options: InitOptions,
  requested: AgentName | undefined,
): Promise<boolean> {
  const { installation, messages, adapters } = options;
  const project = await requireProjectAt(root);
  const connected = connectedAdaptersOf(project.config, adapters);
  const isRequestedConnected = connected.some((adapter) => adapter.name === requested);

  if (requested !== undefined && !isRequestedConnected) {
    return addAgent(project, adapters[requested], options);
  }

  const { report, isHarnessOutdated } = await inspectProjectFiles(project, installation, connected);
  const status = filesStatusOf(report);
  const isCurrent = status === "current" && !isHarnessOutdated;

  console.log(messages.init.alreadyConnected);
  console.log(messages.init.configValid);
  console.log(isCurrent ? messages.init.filesCurrent : messages.init.filesOutdated);
  console.log(isCurrent ? messages.init.nothingToDo : messages.init.runSync);

  return isCurrent;
}

/**
 * Connects the project: shows what was found, asks "Continue?", writes the config and agent
 * files. After a refusal writes nothing. An already connected project is checked, not changed.
 * @param {string} root Project root: the directory the command was run from.
 * @param {InitOptions} options Confirmation, flags, Cyberzavod version, messages.
 * @returns {Promise<boolean>} true if the project is connected and its files are current, or the
 *   human refused; false if the connected project needs sync.
 * @throws {CommandError} If a flag is invalid, the human's files block connecting, or an agent
 *   is added to a project of another harness version: then nothing is written.
 * @throws {Error} If the agent's own config cannot be edited: then nothing is written.
 */
export async function initProject(root: string, options: InitOptions): Promise<boolean> {
  const { confirm, overrides, installation, messages, adapters } = options;
  const requested = requestedAgentOf(options.agent);
  const isConnected = (await readProjectConfig(root)) !== undefined;

  if (isConnected) return reportConnected(root, options, requested);

  const detected = await detectProject(root);
  const adapter = adapters[requested ?? DEFAULT_AGENT_NAME];
  const config = initialConfigOf({
    detected,
    harness: installation.harness,
    overrides,
    identity: adapter.identity,
  });
  const rulesPlan = await planRules(root, adapter);
  const ignoreEntry = captureIgnoreEntry(config.journal);
  const movedRulesFile = rulesPlan.kind === "moved" ? rulesPlan.from : undefined;
  const blocked = await blockingFiles({ root, config }, adapter, movedRulesFile, installation);

  requireNothingBlocked(blocked);

  // The human's own agent config is checked before the summary: if it cannot be edited, nothing
  // has been written yet.
  const userConfigPlan = await adapter.userConfig?.planConnect({ root, version: config.harness });

  printSummary({ config, adapter, rulesPlan, ignoreEntry, userConfigPlan, messages });

  const isConfirmed = await confirm(messages.init.confirm);

  if (!isConfirmed) {
    console.log(messages.init.cancelled);

    return true;
  }

  await writeProjectConfig(root, config);
  await applyRules({
    root,
    plan: rulesPlan,
    template: installation.rulesTemplate,
    name: detected.name,
    commands: config.verification.commands,
  });

  const isIgnoreEntryAdded =
    ignoreEntry !== undefined && (await appendIgnoreEntry(root, ignoreEntry));
  const report = await adapter.syncFiles({
    projectDirectory: root,
    installation,
    force: false,
  });

  await userConfigPlan?.apply();

  printDone({
    changed: [...report.added, ...report.updated],
    isRulesFileWritten: rulesPlan.kind !== "kept",
    isIgnoreEntryAdded,
    adapter,
    messages,
  });

  return true;
}
