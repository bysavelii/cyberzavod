// Agent raw log → build recording draft.
// Stages are inferred from the agent's actions by the tables below; a new stage sign is a new row
// in a table.

import path from "node:path";
import {
  FOREMAN,
  STAGES,
  type InterventionReason,
  type Speaker,
  type Stage,
} from "@cyberzavod/core";
import { eventBuilds } from "./builds.ts";
import type {
  Draft,
  DraftBuild,
  DraftEvent,
  DraftIntervention,
  DraftMessage,
  DraftRun,
  MessageSource,
} from "./draft.ts";
import type { RawEvent } from "./raw-event.ts";
import { isHumanPrompt } from "./service-messages.ts";
import type {
  AgentAssignment,
  AgentReport,
  ModelReply,
  TokenUsage,
  TranscriptText,
} from "./transcript-model.ts";

// Tools that reveal the stage.
const TOOL_STAGES: Readonly<Record<string, Stage>> = {
  Edit: "implementation",
  Write: "implementation",
  MultiEdit: "implementation",
  NotebookEdit: "implementation",
  apply_patch: "implementation",
  ExitPlanMode: "planning",
};

// A path as one shell argument: in double quotes, in single quotes or without them. Shared by
// `cd X` and `git -C X`, so that a path with a space reads the same everywhere.
const PATH_ARGUMENT = String.raw`"[^"]*"|'[^']*'|\S+`;

// Programs whose launch reveals the stage. The start of each command in the chain is compared
// (`cd apps/api && go test ./...`), not any substring: `cat eslint.config.js`
// or `grep vitest` are not checks.
const COMMAND_STAGES: readonly { pattern: RegExp; stage: Stage }[] = [
  { pattern: /^make check\b/, stage: "verification" },
  { pattern: /^pnpm (?:-r |--filter \S+ )?(?:run )?(?:check|test|lint)\b/, stage: "verification" },
  {
    pattern: /^(?:pnpm exec |npx )?(?:vitest|eslint|prettier --check)(?:\s|$)/,
    stage: "verification",
  },
  { pattern: /^go test\b/, stage: "verification" },
  { pattern: /^golangci-lint run\b/, stage: "verification" },
  { pattern: /^node --test\b/, stage: "verification" },
  { pattern: new RegExp(`^git (?:-C (?:${PATH_ARGUMENT}) )?(?:commit|push)\\b`), stage: "record" },
];

// Command separators in one Bash call, including the line break in a multiline command.
const COMMAND_SEPARATOR = /\s*(?:&&|\|\||;|\||\n)\s*/;
// Variable assignments before a command: `CI=1 pnpm test`.
const LEADING_ENV_ASSIGNMENTS = /^(?:\w+=\S*\s+)*/;
// A directory change in the chain: `cd X`, where X is the only argument.
const CHANGE_DIRECTORY = /^cd(?:\s|$)/;
const CHANGE_DIRECTORY_TARGET = new RegExp(`^cd\\s+(${PATH_ARGUMENT})$`);
// A subshell, `pushd` and compound commands change the directory in a way the command text cannot
// trace: `{ cd /b; }`, `if …; then cd /b; fi`, `do cd /b`, `command cd /b`. Compound command
// words (`{`, `then`, `do`, `else`) and `command cd` stand before the segment's real command,
// so the whole segment gets an unknown place. Other `command` uses (`command -v jq`)
// do not change the directory and leave the place alone.
const UNTRACKABLE_DIRECTORY_CHANGE = /^(?:\(|(?:pushd|\{|then|do|else|command\s+cd)(?:\s|$))/;
// Directory of a single git command: `git -C X commit`.
const GIT_DIRECTORY_TARGET = new RegExp(`^git -C (${PATH_ARGUMENT})\\s`);
// A directory that cannot be computed without a shell: home (`~`), a variable, command
// substitution.
const UNRESOLVABLE_DIRECTORY = /[~$`]/;
// Quotes and a backslash in the path after removing the outer quotes (`"/p/a"/sub`, `/a\ b`): the
// shell joins or escapes them its own way, and the path as written is no longer the real one.
const LEFTOVER_QUOTING = /["'\\]/;
// Quoted text on one line: `'…'`, `"…"` and an escaped character outside quotes (`\"`).
// A `$(…)` substitution in double quotes is part of the text if closed on the same line and without
// parentheses and double quotes inside (`"$(pwd)"`). An unclosed `$(` does not count as text:
// in `"$(cat <<'EOF'` the shell starts a real heredoc, and skipping it would mean parsing
// the commit body as commands.
const QUOTED_TEXT = String.raw`'[^']*'|"(?:[^"\\$]|\\.|\$\([^()"]*\)|\$(?!\())*"|\\.`;
// Heredoc start: `<<EOF`, `<<-EOF`, `<<'EOF'`, `<<"EOF"`; `<<<` is a string, not a heredoc.
// The line is read left to right in one pass, and quoted text is consumed whole before
// `<<` is found in it: `echo "a << b"` does not start a heredoc. Such a match has no groups.
const HEREDOC_START_OR_QUOTED_TEXT = new RegExp(
  String.raw`(?<!<)<<(?!<)(-?)\s*(?:'([A-Za-z_]\w*)'|"([A-Za-z_]\w*)"|\\?([A-Za-z_]\w*))|${QUOTED_TEXT}`,
  "g",
);
const LEADING_TABS = /^\t+/;
const PREVIOUS_DIRECTORY = "-";
const PARENT_SEGMENT = "..";
const SURROUNDING_QUOTES = /^(["'])(.*)\1$/;

// Subagents that reveal the stage: the built-in Plan and the /feature pipeline stations
// from the agents' role files.
const AGENT_STAGES: Readonly<Record<string, Stage>> = {
  Plan: "planning",
  analyst: "planning",
  coder: "implementation",
  tester: "verification",
  reviewer: "review",
};

// /feature station verdicts are the first line of the agent's reply, per agent: another agent's
// word is not a verdict (`NEEDS WORK` from the tester), and for agents without a table (analyst,
// coder) the first line is just the start of the report. A rejection sends the part back to the
// agent's stage, and the last verdict, like the last checks run, decides the build outcome.
type Verdict = { passed: true } | { passed: false; reason: string };

const TESTER_DEFECT_REASON = "the tester found a defect";
const REVIEW_REWORK_REASON = "the review sent the work back for rework";

// Russian verdicts are harness words before 0.8.0 from old raw logs.
const VERDICTS: Readonly<Record<string, Readonly<Record<string, Verdict>>>> = {
  tester: {
    "CHECKS PASSED": { passed: true },
    DONE: { passed: true },
    DEFECT: { passed: false, reason: TESTER_DEFECT_REASON },
    "ПРОВЕРКИ ПРОЙДЕНЫ": { passed: true },
    ГОТОВО: { passed: true },
    ДЕФЕКТ: { passed: false, reason: TESTER_DEFECT_REASON },
  },
  reviewer: {
    APPROVED: { passed: true },
    "NEEDS WORK": { passed: false, reason: REVIEW_REWORK_REASON },
    ПРИНЯТО: { passed: true },
    "НА ДОРАБОТКУ": { passed: false, reason: REVIEW_REWORK_REASON },
  },
};

// Stations after which automation waits for the human instead of calling the next one: the plan
// goes for approval. A station rework (a rejecting verdict) also waits for the human, but it comes
// from `VERDICTS`. The table shows the reason for the call; the prompt text is not parsed for it.
const AGENT_HUMAN_CALLS: Readonly<Record<string, InterventionReason>> = {
  analyst: "plan_review",
};
const REWORK_CALL: InterventionReason = "rework_limit";
const ANSWER_CALL: InterventionReason = "question";
const STOP_GATE_CALL: InterventionReason = "stop_gate";

const SHORT_SESSION_LENGTH = 8;
// Length of the day `2026-10-04` at the start of a toISOString string, in UTC wherever the draft is
// built.
const ISO_DATE_LENGTH = 10;
const TEST_FAILURE_REASON = "checks failed";
// The token span before the first build anchor: there is no event to insert it after.
const BEFORE_FIRST_ANCHOR = -1;

/** Build data that is not in the log. */
export interface DraftMeta {
  sessionId: string;
  /** Subagent run tokens by `agentId`: each run carries its own transcript. */
  runTokens?: ReadonlyMap<string, number>;
  /** Main session message tokens: they are split between builds by these. */
  sessionUsages?: readonly TokenUsage[];
  /** Model replies from the session transcript: a prompt finds its model by them. */
  replies?: readonly ModelReply[];
  /** Model replies from the session transcript: final replies to the human come from them. */
  answers?: readonly TranscriptText[];
  /** Tasks for subagents from the session transcript. */
  assignments?: readonly AgentAssignment[];
  /** Subagent run reports from their transcripts. */
  reports?: readonly AgentReport[];
  /** Project id by the directory the command ran in: from the project config. */
  projectsByDirectory?: ReadonlyMap<string, string>;
}

// Station stage by agent name; Object.hasOwn so that "constructor" is not found in the prototype.
function stageOfAgent(agent: string | undefined): Stage | undefined {
  return agent !== undefined && Object.hasOwn(AGENT_STAGES, agent)
    ? AGENT_STAGES[agent]
    : undefined;
}

// A prompt was received by the model that replied first after it.
function modelAnswering(replies: readonly ModelReply[], promptTs: number): string | undefined {
  return replies.find((reply) => reply.ts >= promptTs)?.model;
}

// Where a tool ran: it decides which project the call belongs to. `session` is an old log without
// `cwd`: the session directory, and so the project from `session_start`.
type ToolPlace = { in: "directory"; directory: string } | { in: "session" } | { in: "unknown" };

const SESSION_PLACE: ToolPlace = { in: "session" };
const UNKNOWN_PLACE: ToolPlace = { in: "unknown" };

// A stage with the place where it was passed.
interface PlacedStage {
  stage: Stage;
  place: ToolPlace;
}

function withoutQuotes(word: string): string {
  return SURROUNDING_QUOTES.exec(word)?.[2] ?? word;
}

// Place after moving to `directory`. A path relative to the session directory stays the session
// directory while it does not leave it: above it the project can no longer be guessed.
function placeAfterMove(place: ToolPlace, directory: string): ToolPlace {
  const isUnresolvable =
    directory === "" || directory === PREVIOUS_DIRECTORY || UNRESOLVABLE_DIRECTORY.test(directory);

  if (isUnresolvable) return UNKNOWN_PLACE;
  if (path.posix.isAbsolute(directory)) {
    return { in: "directory", directory: path.posix.resolve(directory) };
  }

  switch (place.in) {
    case "directory":
      return { in: "directory", directory: path.posix.resolve(place.directory, directory) };
    case "session":
      return directory.split("/").includes(PARENT_SEGMENT) ? UNKNOWN_PLACE : SESSION_PLACE;
    case "unknown":
      return UNKNOWN_PLACE;
    default:
      return place satisfies never;
  }
}

// Place after moving to a directory written as a shell word: outer quotes are removed, and a path
// that still has quotes or a backslash after that cannot be computed.
function placeAfterShellMove(place: ToolPlace, word: string): ToolPlace {
  const directory = withoutQuotes(word);

  return LEFTOVER_QUOTING.test(directory) ? UNKNOWN_PLACE : placeAfterMove(place, directory);
}

// Initial place of a call: the directory from the hook's `cwd`, and without it (old log), the
// session directory.
function startPlaceOf(cwd: string | undefined): ToolPlace {
  return cwd === undefined ? SESSION_PLACE : placeAfterMove(UNKNOWN_PLACE, cwd);
}

// Place of a `cd` command: without an argument or with extra flags the shell goes somewhere
// unguessable.
function placeAfterChangeDirectory(program: string, place: ToolPlace): ToolPlace {
  const target = CHANGE_DIRECTORY_TARGET.exec(program)?.[1];

  return target === undefined ? UNKNOWN_PLACE : placeAfterShellMove(place, target);
}

// `git -C X` sets the directory only for its own command, not for the whole chain.
function placeOfProgram(program: string, place: ToolPlace): ToolPlace {
  const target = GIT_DIRECTORY_TARGET.exec(program)?.[1];

  return target === undefined ? place : placeAfterShellMove(place, target);
}

// The heredoc end the shell waits for: a line of just the delimiter, for `<<-` with an indent
// of tabs.
interface HeredocEnd {
  delimiter: string;
  indented: boolean;
}

function heredocsStartedBy(line: string): HeredocEnd[] {
  return [...line.matchAll(HEREDOC_START_OR_QUOTED_TEXT)].flatMap(
    ([, dash, single, double, bare]) => {
      const delimiter = single ?? double ?? bare;

      return delimiter === undefined ? [] : [{ delimiter, indented: dash === "-" }];
    },
  );
}

function endsHeredoc(line: string, end: HeredocEnd): boolean {
  return (end.indented ? line.replace(LEADING_TABS, "") : line) === end.delimiter;
}

// A heredoc body is data for a command, not chain commands: `cat <<'EOF'` with `make check` inside
// does not run checks. The line with `<<EOF` stays: it is a command itself.
function withoutHeredocBodies(command: string): string {
  const kept: string[] = [];
  const awaited: HeredocEnd[] = [];

  for (const line of command.split("\n")) {
    const [end] = awaited;
    const isHeredocBody = end !== undefined;

    if (end !== undefined && endsHeredoc(line, end)) awaited.shift();
    if (isHeredocBody) continue;

    kept.push(line);
    awaited.push(...heredocsStartedBy(line));
  }

  return kept.join("\n");
}

// Stages of the recognized chain commands in order, each with a place: `make check && git commit`
// is checks, then release. A segment's place comes from the last `cd` before it.
function stagesOfCommand(command: string, start: ToolPlace): PlacedStage[] {
  const placed: PlacedStage[] = [];
  let place = start;

  for (const segment of withoutHeredocBodies(command).split(COMMAND_SEPARATOR)) {
    const program = segment.trim().replace(LEADING_ENV_ASSIGNMENTS, "");

    if (UNTRACKABLE_DIRECTORY_CHANGE.test(program)) {
      place = UNKNOWN_PLACE;
      continue;
    }
    if (CHANGE_DIRECTORY.test(program)) {
      place = placeAfterChangeDirectory(program, place);
      continue;
    }

    const rule = COMMAND_STAGES.find(({ pattern }) => pattern.test(program));

    if (rule !== undefined) {
      placed.push({ stage: rule.stage, place: placeOfProgram(program, place) });
    }
  }

  return placed;
}

type ToolEvent = Extract<RawEvent, { kind: "tool" }>;

// Stages passed by a call, with places. A successful chain passed all its stages. A failed one,
// only the first: execution most likely did not get past the first recognized command, and its
// failure is the cause of the whole chain's failure. Only edit tools have a file: their place is
// the file's directory; for the others it is the launch directory.
function stagesReachedByTool(event: ToolEvent): PlacedStage[] {
  const start = startPlaceOf(event.cwd);
  const byTool = TOOL_STAGES[event.tool];

  if (byTool !== undefined) {
    const place =
      event.file === undefined ? start : placeAfterMove(start, path.posix.dirname(event.file));

    return [{ stage: byTool, place }];
  }
  if (event.tool !== "Bash" || event.command === undefined) return [];

  const stages = stagesOfCommand(event.command, start);

  return event.ok ? stages : stages.slice(0, 1);
}

// Reason for calling the human after a station stops; Object.hasOwn as in stageOfAgent.
function humanCallOfAgent(agent: string): InterventionReason | undefined {
  return Object.hasOwn(AGENT_HUMAN_CALLS, agent) ? AGENT_HUMAN_CALLS[agent] : undefined;
}

// Agent verdict by the line from the log; Object.hasOwn on both levels so that "constructor"
// is not found in the prototype.
function verdictFor(agent: string, line: string | undefined): Verdict | undefined {
  if (line === undefined || !Object.hasOwn(VERDICTS, agent)) return undefined;

  const verdicts = VERDICTS[agent];

  return verdicts !== undefined && Object.hasOwn(verdicts, line) ? verdicts[line] : undefined;
}

function agentWindowKey(
  event: Extract<RawEvent, { kind: "subagent_start" | "subagent_stop" }>,
): string {
  return event.agentId ?? event.agent;
}

// Station windows with a stage. Subagent tools come in the same session; while a subagent with its
// own stage works, it sets the stage: make check inside the reviewer is part of review, not a
// return to tests. Windows are tracked by agentId; a stop without a matching start (service
// subagents) closes nothing.
interface StationWindows {
  // Records a station start or stop; true if the set of working stations changed.
  observe(event: RawEvent): boolean;
  // A subagent call with a station comes with its agentId, a main session call without agentId but
  // with cwd. An old log has neither, and they cannot be told apart: while a station works,
  // all calls count as its own.
  isStationCall(event: ToolEvent): boolean;
}

function stationWindows(): StationWindows {
  const running = new Set<string>();

  return {
    observe(event) {
      switch (event.kind) {
        case "subagent_start":
          if (stageOfAgent(event.agent) === undefined) return false;

          running.add(agentWindowKey(event));

          return true;
        case "subagent_stop":
          return running.delete(agentWindowKey(event));
        default:
          return false;
      }
    },
    isStationCall(event) {
      if (event.agentId !== undefined) return running.has(event.agentId);
      if (event.cwd !== undefined) return false;

      return running.size > 0;
    },
  };
}

// The stage at moment t is the stage of the last station entry; before the first entry the part is
// at the plan.
function stageAt(events: readonly DraftEvent[], t: number): Stage {
  let stage: Stage = STAGES[0];

  for (const event of events) {
    if (event.t > t) break;
    if (event.type === "stage_enter") stage = event.stage;
  }

  return stage;
}

// Run agents by id: a subagent start shows whose report or message it was.
function agentsByIdOf(events: readonly RawEvent[]): Map<string, string> {
  const agents = new Map<string, string>();

  for (const event of events) {
    if (event.kind === "subagent_start" && event.agentId !== undefined) {
      agents.set(event.agentId, event.agent);
    }
  }

  return agents;
}

// A remark is anything said in the session, still without an addressee: the turn it is in gives
// one. `stage` is the station whose word it is: for a task and a report, the agent's station; for a
// reply, the stage at the moment of the reply. `run` is the station run in question.
interface Remark {
  kind: MessageSource;
  t: number;
  stage: Stage;
  said: string;
  run?: string;
}

function runMark(run: string | undefined): { run?: string } {
  return run === undefined ? {} : { run };
}

// routeMessages sets the addressee: it needs the events of an already built draft.
function messageOfRemark({ kind, t, stage, said, run }: Remark): DraftMessage {
  return {
    t,
    type: "draft_message",
    from: stage,
    to: FOREMAN,
    source: kind,
    said,
    line: "",
    text: "",
    ...runMark(run),
  };
}

// A station task: the agent's worker accepts it. Agents not in AGENT_STAGES are skipped.
function assignmentRemarks(
  assignments: readonly AgentAssignment[],
  agentsById: ReadonlyMap<string, string>,
  at: (ts: number) => number,
): Remark[] {
  return assignments.flatMap((assignment): Remark[] => {
    const agent =
      assignment.via === "spawn" ? assignment.agentType : agentsById.get(assignment.agentId);
    const stage = stageOfAgent(agent);

    return stage === undefined
      ? []
      : [
          {
            kind: "assignment",
            t: at(assignment.ts),
            stage,
            said: assignment.text,
            ...runMark(assignment.agentId),
          },
        ];
  });
}

// A station report: the stage's worker hands over the work.
function reportRemarks(
  reports: readonly AgentReport[],
  agentsById: ReadonlyMap<string, string>,
  at: (ts: number) => number,
): Remark[] {
  return reports.flatMap((report): Remark[] => {
    const stage = stageOfAgent(agentsById.get(report.agentId));

    return stage === undefined
      ? []
      : [{ kind: "report", t: at(report.ts), stage, said: report.text, run: report.agentId }];
  });
}

// A turn runs from a human prompt (including one that became an intervention) to the next human
// prompt or to the end of the log. An answer to a model question does not start a turn: the
// question was asked inside the turn, and the model continues it. `startsTurn` has the same rule
// for the draft.
interface Turn {
  from: number;
  to: number;
}

function turnsOf(events: readonly RawEvent[]): Turn[] {
  const starts = events
    .filter((event) => event.kind === "prompt" && isHumanPrompt(event.text))
    .map((event) => event.ts);

  return starts.map((from, index) => ({ from, to: starts[index + 1] ?? Number.POSITIVE_INFINITY }));
}

// A turn's final reply is the last model text in it; the stage's worker at the moment of the reply
// says it.
function answerRemarks(
  events: readonly RawEvent[],
  answers: readonly TranscriptText[],
  stageOnTime: (t: number) => Stage,
  at: (ts: number) => number,
): Remark[] {
  return turnsOf(events).flatMap((turn): Remark[] => {
    const answer = answers.findLast(({ ts }) => ts >= turn.from && ts < turn.to);

    if (answer === undefined) return [];

    const t = at(answer.ts);

    return [{ kind: "answer", t, stage: stageOnTime(t), said: answer.text }];
  });
}

// Whom a worker talks to when handing over work or replying: the next one by task, and if nobody
// follows, the foreman. A task for the same station does not count: it adds to its own work.
function recipientOfReport(remarks: readonly Remark[], index: number, stage: Stage): Speaker {
  for (const next of remarks.slice(index + 1)) {
    if (next.kind === "answer") return FOREMAN;
    if (next.kind === "assignment" && next.stage !== stage) return next.stage;
  }

  return FOREMAN;
}

// Whom a worker got the task from: the station that handed over work last (not itself),
// and if there is none, the foreman who just set the task.
function giverOfAssignment(remarks: readonly Remark[], index: number, stage: Stage): Speaker {
  const report = remarks
    .slice(0, index)
    .findLast((previous) => previous.kind === "report" && previous.stage !== stage);

  return report?.stage ?? FOREMAN;
}

// Remark route: the station's worker speaks. A task is said by the one accepting it ("Got it, I'll
// look"), a report by the one handing over ("Here you go"), a reply to the foreman.
function routeOf(
  remark: Remark,
  remarks: readonly Remark[],
  index: number,
): Pick<DraftMessage, "from" | "to"> {
  const { kind, stage } = remark;

  switch (kind) {
    case "assignment":
      return { from: stage, to: giverOfAssignment(remarks, index, stage) };
    case "report":
      return { from: stage, to: recipientOfReport(remarks, index, stage) };
    case "answer":
      return { from: stage, to: FOREMAN };
    default:
      return kind satisfies never;
  }
}

// A turn starts with a human prompt, including one that became an intervention, except an answer to
// a model question: the same turn as in `turnsOf` over the raw log.
function startsTurn(event: DraftEvent): boolean {
  return (
    event.type === "draft_prompt" ||
    (event.type === "draft_intervention" && event.reason !== ANSWER_CALL)
  );
}

// Remarks are split into turns by human prompts: a turn lasts from a prompt to the next one, and
// what was said before the first prompt forms its own turn.
function splitIntoTurns<T extends { remark: Remark }>(
  items: readonly T[],
  promptTimes: readonly number[],
): T[][] {
  const turns: T[][] = [[], ...promptTimes.map((): T[] => [])];

  for (const item of items) {
    const turn = promptTimes.filter((promptTime) => promptTime <= item.remark.t).length;

    turns[turn]?.push(item);
  }

  return turns;
}

// Messages go after events with the same t: first the event happens, then it is talked about.
function mergeMessages(events: readonly DraftEvent[], messages: readonly DraftMessage[]) {
  const merged: DraftEvent[] = [];
  let pending = [...messages].sort((a, b) => a.t - b.t);

  for (const event of events) {
    const earlier = pending.filter((message) => message.t < event.t);

    merged.push(...earlier, event);
    pending = pending.slice(earlier.length);
  }

  return [...merged, ...pending];
}

// Remark of a draft message: for a reply the stage is the build's stage at the moment of the reply,
// for the others, the speaker's.
function remarkOfMessage(message: DraftMessage, buildEvents: readonly DraftEvent[]): Remark {
  const { source, t, from, said } = message;

  return {
    kind: source,
    t,
    said,
    stage: source === "answer" ? stageAt(buildEvents, t) : stageOfSpeaker(from),
  };
}

// The speaker in a station message is always the stage's worker: the foreman gives no remarks.
function stageOfSpeaker(speaker: Speaker): Stage {
  return speaker === FOREMAN ? STAGES[0] : speaker;
}

/**
 * Recalculates message routes: whom each one addresses and from whose stage a reply sounds. Each
 * build is counted separately: only its prompts divide turns, the stage comes from its events, so a
 * station report of one task is not addressed to a station of another. A task of station X is said
 * by X to whoever handed over work last (another station's report earlier in the turn), and if
 * there is none, to the foreman. A report of station X is said by X to whoever's task comes next
 * (another station), and if a reply to the human came earlier or the turn ended, to the foreman. A
 * reply is said by the stage's worker at the moment of the reply to the foreman.
 * @param {Draft} draft Draft with messages and builds assigned.
 * @returns {Draft} The same draft with `from` and `to` of its messages recalculated.
 */
export function routeMessages(draft: Draft): Draft {
  const owners = eventBuilds(draft);
  const events = [...draft.events];

  for (const build of draft.builds) {
    for (const { index, message } of routedMessagesOfBuild(draft, owners, build.id)) {
      events[index] = message;
    }
  }

  return { ...draft, events };
}

// Messages of one build with a recalculated route and their positions in the draft events.
function routedMessagesOfBuild(
  draft: Draft,
  owners: readonly string[],
  buildId: string,
): { index: number; message: DraftMessage }[] {
  const own = draft.events.flatMap((event, index) =>
    owners[index] === buildId ? [{ event, index }] : [],
  );
  const buildEvents = own.map(({ event }) => event);
  const promptTimes = buildEvents.flatMap((event) => (startsTurn(event) ? [event.t] : []));
  const spoken = own.flatMap(({ event, index }) =>
    event.type === "draft_message"
      ? [{ message: event, index, remark: remarkOfMessage(event, buildEvents) }]
      : [],
  );

  return splitIntoTurns(spoken, promptTimes).flatMap((turn) => {
    const remarks = turn.map(({ remark }) => remark);

    return turn.map(({ message, index, remark }, position) => ({
      index,
      message: { ...message, ...routeOf(remark, remarks, position) },
    }));
  });
}

// Project, harness version and workflow come from the first session start that has them: the
// session could have been connected to the hooks mid-work, and then the first start has no project.
function projectOf(
  events: readonly RawEvent[],
): Pick<DraftBuild, "project" | "harness" | "workflow"> {
  for (const event of events) {
    if (event.kind !== "session_start") continue;

    const { project, harness, workflow } = event;

    if (project !== undefined && harness !== undefined && workflow !== undefined) {
      return { project, harness, workflow };
    }
  }

  return { project: "", harness: "", workflow: "" };
}

// Project of a place: for a directory, by the map; for the session, the project from
// `session_start`; where the place is unknown or the project was not found, there is no tag and the
// event goes to a build by time.
function projectOfPlace(
  place: ToolPlace,
  sessionProject: string,
  projectsByDirectory: ReadonlyMap<string, string> | undefined,
): string | undefined {
  switch (place.in) {
    case "directory":
      return projectsByDirectory?.get(place.directory);
    case "session":
      return sessionProject === "" ? undefined : sessionProject;
    case "unknown":
      return undefined;
    default:
      return place satisfies never;
  }
}

// A call directory that is known but belongs to no project (drafts in /tmp): its stage belongs to
// no one, and by time it would go to someone else's build. Without a projects map there is nothing
// to judge.
function directoryOutsideProjects(
  place: ToolPlace,
  projectsByDirectory: ReadonlyMap<string, string> | undefined,
): string | undefined {
  if (place.in !== "directory" || projectsByDirectory === undefined) return undefined;

  return projectsByDirectory.has(place.directory) ? undefined : place.directory;
}

function projectMark(project: string | undefined): { project?: string } {
  return project === undefined ? {} : { project };
}

// An event anchors a build to its place in the draft: a human prompt or intervention
// or a run event.
function isBuildAnchor(event: DraftEvent): boolean {
  return (
    event.type === "draft_prompt" || event.type === "draft_intervention" || event.run !== undefined
  );
}

function draftIntervention(t: number, reason: InterventionReason, said: string): DraftIntervention {
  return { t, type: "draft_intervention", reason, said, line: "", text: "" };
}

// Main session tokens land in the draft by spans between neighboring build anchors: a span's
// messages are summed into one `usage` at the time of the first anchor, and so go to the same
// build. Messages before the first anchor go to the start of the draft, to the first build.
function withSessionUsages(
  events: readonly DraftEvent[],
  usages: readonly TokenUsage[],
): DraftEvent[] {
  const anchors = events.flatMap((event, index) =>
    isBuildAnchor(event) ? [{ t: event.t, index }] : [],
  );
  const sums = new Map<number, { t: number; tokens: number }>();

  for (const { ts, tokens } of usages) {
    const anchor = anchors.findLast((candidate) => candidate.t <= ts);
    const key = anchor?.index ?? BEFORE_FIRST_ANCHOR;
    const sum = sums.get(key);

    sums.set(key, { t: anchor?.t ?? 0, tokens: (sum?.tokens ?? 0) + tokens });
  }

  const toEvent = (sum: { t: number; tokens: number } | undefined): DraftEvent[] =>
    sum === undefined ? [] : [{ t: sum.t, type: "usage", tokens: sum.tokens }];

  return [
    ...toEvent(sums.get(BEFORE_FIRST_ANCHOR)),
    ...events.flatMap((event, index) => [event, ...toEvent(sums.get(index))]),
  ];
}

type SubagentStopEvent = Extract<RawEvent, { kind: "subagent_stop" }>;

// Station verdict by the line of the agent's reply.
interface Judgement {
  agent: string;
  run: string;
  line: string | undefined;
  ts: number;
}

// Walks the log events and accumulates draft events: prompts, interventions, stages, run
// windows, checks outcomes and station tokens. toDraft adds messages and main session tokens.
class DraftEventCollector {
  private readonly draftEvents: DraftEvent[] = [];
  private readonly windows = stationWindows();
  // The stage at which main session tools left each project's build: many edits, one stage. A
  // project without a tag is a key too. A station resets the stages: after it the first command
  // enters its stage again.
  private readonly stagesByProject = new Map<string | undefined, Stage>();
  // A station run window stretches to the end of the log until a stop comes.
  private readonly openRuns = new Map<string, DraftRun>();
  // A station verdict comes with its stop (terminal) or as a separate
  // report by agent_id (desktop app). Each run is judged once; a repeated
  // run of the same agent after SendMessage is a new run with its own verdict.
  private readonly agentsStarted = new Map<string, string>();
  private readonly judgedRuns = new Set<string>();
  // Run tokens are placed at its last stop: there is one transcript for all its starts.
  private readonly lastStops = new Map<string, RawEvent>();
  private readonly sessionProject: string;
  // What stopped automation (`pendingCall`) and what it now awaits from the human
  // (`awaitingHuman`): a main session stop turns the first into the second, a station start resets
  // both, a human prompt takes them.
  private pendingCall: InterventionReason | undefined;
  private awaitingHuman: InterventionReason | undefined;

  private readonly events: readonly RawEvent[];
  private readonly meta: DraftMeta;
  private readonly at: (ts: number) => number;
  private readonly endTs: number;

  constructor(
    events: readonly RawEvent[],
    meta: DraftMeta,
    at: (ts: number) => number,
    endTs: number,
  ) {
    this.events = events;
    this.meta = meta;
    this.at = at;
    this.endTs = endTs;
    this.sessionProject = projectOf(events).project;

    for (const event of events) {
      if (event.kind === "subagent_stop" && event.agentId !== undefined) {
        this.lastStops.set(event.agentId, event);
      }
    }
  }

  collect(): DraftEvent[] {
    for (const event of this.events) this.collectEvent(event);

    return this.draftEvents;
  }

  private collectEvent(event: RawEvent): void {
    switch (event.kind) {
      case "prompt":
        return this.collectPrompt(event.ts, event.text, event.afterStopGate === true);
      case "subagent_start":
        return this.collectSubagentStart(event);
      case "subagent_stop":
        return this.collectSubagentStop(event);

      case "subagent_report": {
        const agent = this.agentsStarted.get(event.agentId);

        if (agent !== undefined) {
          this.judge({ agent, run: event.agentId, line: event.verdict, ts: event.ts });
        }

        return;
      }

      case "tool":
        return this.collectTool(event);
      case "question_answer":
        this.draftEvents.push(draftIntervention(this.at(event.ts), ANSWER_CALL, event.text));

        return;
      case "stop":
        this.awaitingHuman = this.pendingCall;

        return;
      case "session_start":
        return;
      default:
        return event satisfies never;
    }
  }

  private collectPrompt(ts: number, text: string, isAfterStopGate: boolean): void {
    if (!isHumanPrompt(text)) return;

    const reason = isAfterStopGate ? STOP_GATE_CALL : this.awaitingHuman;

    this.pendingCall = undefined;
    this.awaitingHuman = undefined;

    if (reason !== undefined) {
      this.draftEvents.push(draftIntervention(this.at(ts), reason, text));

      return;
    }

    const model = modelAnswering(this.meta.replies ?? [], ts);

    this.draftEvents.push({
      t: this.at(ts),
      type: "draft_prompt",
      said: text,
      goal: "",
      requirements: [],
      ...(model === undefined ? {} : { model }),
    });
  }

  private collectSubagentStart(event: Extract<RawEvent, { kind: "subagent_start" }>): void {
    if (event.agentId !== undefined) this.agentsStarted.set(event.agentId, event.agent);

    const run = agentWindowKey(event);

    this.judgedRuns.delete(run);

    const stage = stageOfAgent(event.agent);

    if (stage === undefined) return;

    this.pendingCall = undefined;
    this.awaitingHuman = undefined;
    this.windows.observe(event);
    this.stagesByProject.clear();
    this.draftEvents.push({ t: this.at(event.ts), type: "stage_enter", stage, run });

    const window: DraftRun = {
      t: this.at(event.ts),
      type: "draft_run",
      run,
      agent: event.agent,
      until: this.at(this.endTs),
    };

    this.draftEvents.push(window);
    this.openRuns.set(run, window);
  }

  private collectSubagentStop(event: SubagentStopEvent): void {
    const run = agentWindowKey(event);

    if (this.windows.observe(event)) this.stagesByProject.clear();

    const window = this.openRuns.get(run);

    if (window !== undefined) window.until = this.at(event.ts);

    this.openRuns.delete(run);

    if (stageOfAgent(event.agent) !== undefined) this.pendingCall = humanCallOfAgent(event.agent);

    this.judge({ agent: event.agent, run, line: event.verdict, ts: event.ts });
    this.countRunTokens(event);
  }

  private collectTool(event: ToolEvent): void {
    if (this.windows.isStationCall(event)) return;

    for (const { stage, place } of stagesReachedByTool(event)) {
      const { projectsByDirectory } = this.meta;

      if (directoryOutsideProjects(place, projectsByDirectory) !== undefined) continue;

      const mark = projectMark(projectOfPlace(place, this.sessionProject, projectsByDirectory));

      this.enterStageByTool(stage, mark.project, event.ts);

      if (stage === "verification") this.collectVerification(event, mark);
    }
  }

  private collectVerification(event: ToolEvent, mark: { project?: string }): void {
    const t = this.at(event.ts);

    this.draftEvents.push({ t, type: "draft_check", ok: event.ok, ...mark });

    if (!event.ok) {
      this.draftEvents.push({
        t,
        type: "stage_fail",
        stage: "verification",
        reason: TEST_FAILURE_REASON,
        ...mark,
      });
    }
  }

  private enterStageByTool(stage: Stage, project: string | undefined, ts: number): void {
    if (this.stagesByProject.get(project) === stage) return;

    this.stagesByProject.set(project, stage);
    this.draftEvents.push({
      t: this.at(ts),
      type: "stage_enter",
      stage,
      ...projectMark(project),
    });
  }

  private judge({ agent, run, line, ts }: Judgement): void {
    const stage = stageOfAgent(agent);
    const verdict = verdictFor(agent, line);

    if (stage === undefined || verdict === undefined || this.judgedRuns.has(run)) return;

    this.judgedRuns.add(run);
    this.draftEvents.push({ t: this.at(ts), type: "draft_check", ok: verdict.passed, run });

    if (!verdict.passed) {
      this.pendingCall = REWORK_CALL;
      this.draftEvents.push({
        t: this.at(ts),
        type: "stage_fail",
        stage,
        reason: verdict.reason,
        run,
      });
    }
  }

  private countRunTokens(event: SubagentStopEvent): void {
    const { agentId } = event;
    const tokens = agentId === undefined ? undefined : this.meta.runTokens?.get(agentId);
    const isLastStop = agentId !== undefined && this.lastStops.get(agentId) === event;

    if (agentId === undefined || tokens === undefined || !isLastStop) return;

    const run = stageOfAgent(event.agent) === undefined ? undefined : agentId;

    this.draftEvents.push({ t: this.at(event.ts), type: "usage", tokens, ...runMark(run) });
  }
}

// Station messages and replies to the human, still without `line` and `text`: the editor fills them
// in.
function messagesOf(
  events: readonly RawEvent[],
  meta: DraftMeta,
  draftEvents: readonly DraftEvent[],
  atWithinBuild: (ts: number) => number,
): DraftMessage[] {
  const agentsById = agentsByIdOf(events);
  const stageOnTime = (t: number) => stageAt(draftEvents, t);
  const remarks = [
    ...assignmentRemarks(meta.assignments ?? [], agentsById, atWithinBuild),
    ...reportRemarks(meta.reports ?? [], agentsById, atWithinBuild),
    ...answerRemarks(events, meta.answers ?? [], stageOnTime, atWithinBuild),
  ];

  return remarks.sort((a, b) => a.t - b.t).map(messageOfRemark);
}

/**
 * Builds a recording draft from the raw log: human prompts, messages (tasks, reports and final
 * replies, if their texts are passed), stages, station run windows, checks outcomes and tokens. The
 * title, clean prompt versions and `line` with `text` of messages stay empty; the editor fills them
 * in. The draft has one build with the draft `id`; the project and harness version come from the
 * first session start that has them, and stay empty without them. The editor adds other builds.
 * Main session events from tools get a `project` tag by the command directory if it is in
 * `meta.projectsByDirectory`. The stage of a call from a known directory missing from this map
 * (outside any project) does not get into the draft, including checks: they do not affect the build
 * outcome. `directoriesOutsideProjects` tells which directories were dropped. Without a projects
 * map no stages are dropped.
 * @param {RawEvent[]} rawEvents Log events in any order.
 * @param {DraftMeta} meta Build data that is not in the log.
 * @returns {Draft} Draft with an id like `2026-10-04-744e7547`: the start day in UTC and the start
 *   of the session id.
 */
export function toDraft(rawEvents: RawEvent[], meta: DraftMeta): Draft {
  const events = [...rawEvents].sort((a, b) => a.ts - b.ts);
  const startTs = events[0]?.ts ?? 0;
  const endTs = events.at(-1)?.ts ?? startTs;
  const at = (ts: number) => ts - startTs;
  // Transcript time can fall outside the log: a message must not end up after the end of the build.
  const atWithinBuild = (ts: number) => Math.min(Math.max(at(ts), 0), at(endTs));
  const draftEvents = new DraftEventCollector(events, meta, at, endTs).collect();
  const messages = messagesOf(events, meta, draftEvents, atWithinBuild);
  const sessionUsages = (meta.sessionUsages ?? [])
    .map(({ ts, tokens }) => ({ ts: at(ts), tokens }))
    .filter(({ ts }) => ts >= 0 && ts <= at(endTs));
  const startedAt = new Date(startTs).toISOString();
  const day = startedAt.slice(0, ISO_DATE_LENGTH);
  const id = `${day}-${meta.sessionId.slice(0, SHORT_SESSION_LENGTH)}`;

  return routeMessages({
    id,
    startedAt,
    builds: [{ id, ...projectOf(events), title: "", language: "", runs: [] }],
    events: withSessionUsages(mergeMessages(draftEvents, messages), sessionUsages),
  });
}

/**
 * Collects paths to the session's own transcripts without repeats: main session tokens are
 * counted from them.
 * @param {RawEvent[]} events Log events.
 * @returns {string[]} Paths to transcripts of session stops, without subagents.
 */
export function sessionTranscriptPaths(events: RawEvent[]): string[] {
  const paths = new Set<string>();

  for (const event of events) {
    if (event.kind === "stop" && event.transcriptPath !== undefined) {
      paths.add(event.transcriptPath);
    }
  }

  return [...paths];
}

/**
 * Collects directories where tools with a stage ran: command projects are found by them. The
 * directory is inferred from `cwd`, `cd` and `git -C` in the command and the edited file's path.
 * @param {RawEvent[]} events Log events.
 * @returns {string[]} Directories without repeats in log order; places that cannot be determined
 *   are left out.
 */
export function toolDirectories(events: RawEvent[]): string[] {
  const directories = events
    .filter((event) => event.kind === "tool")
    .flatMap((event) => stagesReachedByTool(event))
    .flatMap(({ place }) => (place.in === "directory" ? [place.directory] : []));

  return [...new Set(directories)];
}

/**
 * Finds directories whose call stages `toDraft` drops: the directory is known but does not
 * belong to a project (another path, a dev container, a broken or missing config). Checks
 * disappear together with the stage, and they decide the build outcome, so such directories
 * get a warning. Station calls are not counted: `toDraft` skips them for another reason.
 * @param {RawEvent[]} rawEvents Log events in any order.
 * @param {ReadonlyMap<string, string>} projectsByDirectory Project by directory, as
 *   `toDraft` receives it.
 * @returns {string[]} Directories without repeats in log order.
 */
export function directoriesOutsideProjects(
  rawEvents: RawEvent[],
  projectsByDirectory: ReadonlyMap<string, string>,
): string[] {
  const windows = stationWindows();
  const directories = new Set<string>();

  for (const event of [...rawEvents].sort((a, b) => a.ts - b.ts)) {
    if (event.kind !== "tool") {
      windows.observe(event);
      continue;
    }
    if (windows.isStationCall(event)) continue;

    const outside = stagesReachedByTool(event).flatMap(({ place }) => {
      const directory = directoryOutsideProjects(place, projectsByDirectory);

      return directory === undefined ? [] : [directory];
    });

    for (const directory of outside) directories.add(directory);
  }

  return [...directories];
}

/**
 * Finds subagent run transcripts: the tokens of each run are counted from them. The path comes
 * from the stop and, for agents that give it at the start, from the start: a run cut off before it
 * stopped keeps its tokens.
 * @param {RawEvent[]} events Log events.
 * @returns {Map<string, string>} Transcript path by run `agentId`; for a run with several events,
 *   the last one.
 */
export function runTranscriptPaths(events: RawEvent[]): Map<string, string> {
  const paths = new Map<string, string>();

  for (const event of events) {
    if (
      (event.kind === "subagent_start" || event.kind === "subagent_stop") &&
      event.agentId !== undefined &&
      event.transcriptPath !== undefined
    ) {
      paths.set(event.agentId, event.transcriptPath);
    }
  }

  return paths;
}

/**
 * Finds the session's own transcript, without subagents: it receives the human prompts.
 * @param {RawEvent[]} events Log events.
 * @returns {string | undefined} Transcript path, or undefined if the session has not
 *   stopped yet.
 */
export function sessionTranscriptPath(events: RawEvent[]): string | undefined {
  let transcriptPath: string | undefined;

  for (const event of events) {
    if (event.kind === "stop" && event.transcriptPath !== undefined) {
      transcriptPath = event.transcriptPath;
    }
  }

  return transcriptPath;
}

/**
 * Finds the /feature pipeline station transcripts: reports come from them. A station that started
 * and was cut off before it stopped is included when its start gave the path.
 * @param {RawEvent[]} events Log events.
 * @returns {string[]} Paths to transcripts of started or stopped stations without repeats; service
 *   subagents that are not among the stations are left out.
 */
export function stationTranscriptPaths(events: RawEvent[]): string[] {
  const paths = new Set<string>();

  for (const event of events) {
    if (
      (event.kind === "subagent_start" || event.kind === "subagent_stop") &&
      event.transcriptPath !== undefined &&
      stageOfAgent(event.agent) !== undefined
    ) {
      paths.add(event.transcriptPath);
    }
  }

  return [...paths];
}
