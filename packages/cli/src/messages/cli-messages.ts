// CLI texts for the human: help, summaries, confirmation and errors. A value is a string or a
// function of what is substituted into it; with two or more parameters, one object with named
// fields. `languageOf` picks the language; the sets live in `en.ts` and `ru.ts`.

import type { RecordType } from "@cyberzavod/core";

/** CLI commands: each has help in the message catalog. */
export const COMMAND_NAMES = [
  "init",
  "sync",
  "doctor",
  "disconnect",
  "status",
  "decision",
  "note",
  "view",
  "draft",
  "publish",
  "login",
  "logout",
  "share",
  "unshare",
  "gallery",
  "hook",
] as const;

/** CLI command name. */
export type CommandName = (typeof COMMAND_NAMES)[number];

/**
 * Help sections in display order. Service commands belong to no section and are hidden from the
 * list.
 */
export const COMMAND_SECTIONS = ["start", "journal", "gallery", "maintenance"] as const;

/** A help section. */
export type CommandSection = (typeof COMMAND_SECTIONS)[number];

/** A command flag, argument or environment variable and its description. */
export interface CommandParameter {
  name: string;
  description: string;
}

/**
 * Command help: the usage line without the program name, a short description for the command list
 * (one line) and parameters for the command's own help.
 */
export interface CommandHelp {
  usage: string;
  summary: string;
  parameters: readonly CommandParameter[];
}

/** How the agent's product and skill calls are written in texts for the human. */
export interface AgentTerms {
  /** Product name, for example `Claude Code`. */
  product: string;
  /** How the human calls a skill by name, for example `/setup`. */
  skill(name: string): string;
}

/** Help texts. */
export interface HelpMessages {
  title: string;
  /** The "where to start" line under the title. */
  quickStart: string;
  /** Section titles of the command list. */
  sections: Readonly<Record<CommandSection, string>>;

  /** Title of the parameter list in command help. */
  parametersTitle: string;
  /**
   * The last help line: how to learn a command's details and pick a language; `languages` are the
   * supported codes separated by "|". Other ways to pick a language are in the help and README.
   */
  footer(languages: string): string;
}

/**
 * `init` command texts: the summary before the question, the question and the result. Summary lines
 * have no indent.
 */
export interface InitMessages {
  summaryTitle: string;
  /** `init --agent` in a connected project adds one more agent: the title of its summary. */
  addAgentTitle(terms: AgentTerms): string;
  projectId(id: string): string;
  /** Checks found or set by a flag; `commands` are comma-separated. */
  checks(commands: string): string;
  /** No checks; `file` is the project config where they can be added. */
  checksMissing(params: { file: string; terms: AgentTerms }): string;
  rulesStarter(file: string): string;
  rulesMoved(params: { from: string; to: string }): string;
  rulesKept(file: string): string;
  journal(path: string): string;
  /** Files that will appear; `paths` are comma-separated. */
  files(paths: string): string;
  /** The project will be marked trusted in the human's agent config `file`. */
  trustProject(file: string): string;
  /** The project's hooks will be approved in the human's agent config `file`. */
  trustHooks(file: string): string;
  overrideHint: string;
  confirm: string;
  cancelled: string;
  done: string;
  /** What to commit; `paths` are comma-separated. */
  commit(paths: string): string;
  nextSteps(terms: AgentTerms): string;
  /** Repeated `init` in a connected project. */
  alreadyConnected: string;
  configValid: string;
  filesCurrent: string;
  filesOutdated: string;
  nothingToDo: string;
  runSync: string;
}

/** `sync` command texts. */
export interface SyncMessages {
  /** List titles after writing. */
  added: string;
  updated: string;
  removed: string;
  /** Preview list titles. */
  willAdd: string;
  willUpdate: string;
  willRemove: string;
  /** The human's files in place of generated ones. */
  yours: string;
  /** Generated files edited by hand. */
  edited: string;
  /** What sync never touches. */
  neverTouched(terms: AgentTerms): string;
  /** The approval of the hooks in the human's agent config `file` moved to the new hooks. */
  trustRefreshed(file: string): string;
  upToDate: string;
  harnessMismatch(params: { file: string; configVersion: string; cliVersion: string }): string;
  filesOutdated: string;
  /** Sync will stop at the human's files: what to do. */
  blocked: string;
}

/**
 * `doctor` command texts: a label and a hint for each outcome of each check. The `passed` and
 * `notice` label describes what was found, `problem` what is wrong; a hint is one action.
 */
export interface DoctorMessages {
  /** Hint under a ✗ line, without indent; `text` is the action. */
  fix(text: string): string;
  /** Hint under a "–" line, without indent; `text` is an optional action. */
  hint(text: string): string;
  allPassed: string;
  problems(count: number): string;
  node: {
    passed(version: string): string;
    tooOld(params: { version: string; minimum: number }): string;
    install(minimum: number): string;
  };
  git: { passed: string; missing: string; install: string };
  claudeCode: { passed: string; missing: string; install: string };
  codex: { passed: string; missing: string; install: string };
  gallery: {
    signedIn: string;
    notSignedIn: string;
    signIn: string;
    corrupt: string;
    signInAgain: string;
  };
  config: {
    passed(params: { file: string; projectId: string; harness: string }): string;
    notFound(directory: string): string;
    init: string;
    invalid(reason: string): string;
    repair(file: string): string;
    /** The config names agents the CLI cannot drive together; `reason` says which. */
    agents(reason: string): string;
    fixAgents(file: string): string;
  };
  hooks: {
    passed(version: string): string;
    missing(file: string): string;
    otherVersion(params: { file: string; found: string; configVersion: string }): string;
    incomplete(events: string): string;
    unreadable(reason: string): string;
    sync: string;
    repairSettings(file: string): string;
  };
  /** Trust in the human's own agent config: the project and its hooks. */
  trust: {
    passed(file: string): string;
    projectUntrusted(params: { file: string; terms: AgentTerms }): string;
    /** How to trust the project: in the agent, or by hand in `file`. */
    trustProject(params: { file: string; projectKey: string; terms: AgentTerms }): string;
    hooksUntrusted(params: { events: string; terms: AgentTerms }): string;
    approveHooks(terms: AgentTerms): string;
    unreadable(reason: string): string;
    repairConfig: string;
  };
  files: {
    upToDate: string;
    versionsDiffer(params: { file: string; configVersion: string; cliVersion: string }): string;
    matchVersion(configVersion: string): string;
    outdated(count: number): string;
    sync: string;
    writtenByHuman(files: string): string;
    moveToRules(rulesFile: string): string;
    cannotCheck(reason: string): string;
    fixCause: string;
  };
  rules: {
    passed(file: string): string;
    missing(file: string): string;
    create(terms: AgentTerms): string;
    unfilled(file: string): string;
    fill(terms: AgentTerms): string;
  };
  commands: {
    noneSet(file: string): string;
    setUp(params: { file: string; terms: AgentTerms }): string;
    programsFound(programs: string): string;
    programsMissing(programs: string): string;
    fixPrograms(file: string): string;
    allPassed(count: number): string;
    /** A command in the language's quotation marks. */
    quoted(command: string): string;
    exited(params: { command: string; code: number }): string;
    notStarted(params: { command: string; reason: string }): string;
    failed(commands: string): string;
    runYourself(commands: string): string;
  };
  gitignore: {
    passed(entry: string): string;
    nothingToIgnore: string;
    missing(entry: string): string;
    add(params: { entry: string; file: string }): string;
  };
}

/** `disconnect` command texts: plan, question and result. Plan lines have no indent. */
export interface DisconnectMessages {
  willRemove: string;
  willKeep: string;
  settingsUpdated(file: string): string;
  settingsRemoved(file: string): string;
  /** Disconnecting one of several agents takes only its part of the manifest `file`. */
  manifestPartly(file: string): string;
  /** Disconnecting one of several agents takes its settings out of the project config `file`. */
  agentSettingsRemoved(file: string): string;
  /** The other agents `agents` (comma-separated) stay connected with their files. */
  keepAgents(agents: string): string;
  keepSource: string;
  keepJournal(path: string): string;
  keepIgnoreEntry(entry: string): string;
  keepSettings(terms: AgentTerms): string;
  /** Trust Cyberzavod added to the agent config `file` goes away. */
  untrustProject(file: string): string;
  untrustHooks(file: string): string;
  /** Trust the human gave the project themselves stays in `file`. */
  keepProjectTrust(file: string): string;
  editedFile(file: string): string;
  confirm: string;
  cancelled: string;
  /** Run without a terminal and without `--yes`: there is nowhere to ask. */
  needsConfirmation: string;
  /** The result. */
  done: string;
  /** The result of disconnecting one agent of several; the others stay connected. */
  agentDone(terms: AgentTerms): string;
  /**
   * For an agent that reads its own rules file `agentRulesFile` instead of AGENTS.md: how to keep
   * the project rules in it.
   */
  agentRulesHint(params: { rulesFile: string; terms: AgentTerms; agentRulesFile: string }): string;
}

/** `status` command texts. */
export interface StatusMessages {
  recordTypes: Readonly<Record<RecordType, string>>;
  foreman: string;
  checksNone: string;
  project(params: { id: string; root: string }): string;
  harness(version: string): string;
  harnessOutdated(params: { version: string; cliVersion: string }): string;
  workflow(name: string): string;
  checks(commands: string): string;
  journal(params: { path: string; counts: string }): string;
  latestRecord(params: { timestamp: string; type: RecordType }): string;
}

/** `decision` and `note` command texts. */
export interface JournalMessages {
  recorded(path: string): string;
}

/** `view` command texts. */
export interface ViewMessages {
  /** Before the factory floor package is fetched: the first run downloads it; `spec` names it. */
  preparing(spec: string): string;
  /** The line the address is read from, by the human and by the smoke check. */
  address(url: string): string;
  stopHint: string;
  /** The browser could not be opened; the address is above. */
  openFailed: string;
  /** A request of the browser failed, for example the journal is corrupt; `reason` says why. */
  requestFailed(reason: string): string;
}

/** `login` and `logout` command texts. */
export interface LoginMessages {
  openVerification(params: { url: string; code: string }): string;
  waiting: string;
  loggedIn(login: string): string;
  loggedOut: string;
  wasNotLoggedIn: string;
}

/** `share` and `unshare` command texts. */
export interface ShareMessages {
  sent(id: string): string;
  replaced(id: string): string;
  link(url: string): string;
  galleryClosed: string;
  openGalleryHint: string;
  removed(id: string): string;
  galleryRecordings(params: { count: number; limit: number }): string;
  freeUpSpace: string;
}

/** `gallery` command texts. */
export interface GalleryMessages {
  closed(login: string): string;
  open(login: string): string;
  recordings(params: { count: number; limit: number }): string;
  openHint: string;
  closeHint: string;
  page(url: string): string;
  badge(markdown: string): string;
}

/** Error texts for the human: things they fix themselves. */
export interface ErrorMessages {
  missingDecisionText: string;
  missingNoteText: string;
  missingRecordId: string;
  unknownHook(name: string): string;
  /** The config names an agent the CLI cannot drive; `supported` lists the ones it can. */
  unsupportedAgent(params: { agent: string; supported: string }): string;
  /** `init --agent` names an agent the CLI cannot drive. */
  unknownAgent(params: { agent: string; supported: string }): string;
  /** The command works with one agent, several are connected and none is named; `agents` lists them. */
  agentRequired(agents: string): string;
  /** `--agent` names an agent the project is not connected to; `agents` lists the connected ones. */
  agentNotConnected(params: { agent: string; agents: string }): string;
  unknownCommand(name: string): string;
  unknownCommandWithSuggestion(params: { name: string; suggestion: string }): string;
  languageFlagWithoutValue: string;
  unsupportedLanguage(params: { value: string; supported: string }): string;
  projectNotFound(directory: string): string;
  /** npx could not get the factory floor package; `spec` is what it was asked for. */
  viewerUnavailable(spec: string): string;
  /** The factory floor package has no built files at `directory`. */
  viewerBroken(directory: string): string;
  jsonNeedsPreview: string;
  packageJsonInvalid(params: { file: string; reason: string }): string;
  unexpected(reason: string): string;
  /** How to see the stack trace; `variable` is the environment variable. */
  debugHint(variable: string): string;
  initBlocked(params: { files: string; rulesFile: string }): string;
  /** `init --agent` adds an agent to a project whose config is of another Cyberzavod version. */
  addAgentNeedsSync(params: {
    file: string;
    configVersion: string;
    cliVersion: string;
    agent: string;
  }): string;
  blankOption(option: string): string;
  absoluteJournal(path: string): string;
  journalIsProjectRoot(path: string): string;
  invalidRecordId(id: string): string;
  recordMissing(params: { id: string; file: string }): string;
  recordInvalid(params: { id: string; reason: string }): string;
  recordNotSession(params: { id: string; type: RecordType }): string;
  galleryAccessConflict: string;
  notLoggedIn: string;
  tokenRejected: string;
  limitReached: string;
  credentialsCorrupt(file: string): string;
  loginCodeExpired: string;
  loginDenied: string;
  noConnection(params: { origin: string; reason: string }): string;
  githubUnexpectedField(name: string): string;
  githubNoDeviceCode: string;
  githubNoToken: string;
  githubRejected(reason: string): string;
  serverUnexpectedResponse(field: string): string;
  serverStatus(status: number): string;
}

/** All CLI texts. */
export interface CliMessages {
  help: HelpMessages;
  commands: Readonly<Record<CommandName, CommandHelp>>;
  init: InitMessages;
  sync: SyncMessages;
  doctor: DoctorMessages;
  disconnect: DisconnectMessages;
  status: StatusMessages;
  journal: JournalMessages;
  view: ViewMessages;
  login: LoginMessages;
  share: ShareMessages;
  gallery: GalleryMessages;
  errors: ErrorMessages;
}
