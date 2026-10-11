// English texts the adapters share.

import { CLI_COMMAND } from "../cli-command.ts";
import type { KitMessages } from "./kit-messages.ts";
import { formatUsd } from "./money.ts";

/** Shared adapter texts in English. */
export const en: KitMessages = {
  stop: {
    configUnreadable: ({ file, reason }) =>
      `The config ${file} cannot be read — checks were skipped, the agent is released. ${reason}`,
    gitUnavailable: (reason) =>
      `The stop hook could not run git — checks were skipped, the agent is released. ${reason}`,
    counterNotSaved: (file) =>
      `The stop hook could not write the attempt counter (${file}) — checks are red, the agent is released without retries.`,
    checksFailing: ({ command, attempt, maxAttempts, output }) =>
      `${command} fails — you cannot finish yet (attempt ${attempt} of ${maxAttempts}). Fix:\n${output}\n`,
    humanCalled: (maxAttempts) =>
      `Checks are still red after ${maxAttempts} attempts to fix them — the agent is stopped, a human is needed.`,
    markerNotSaved: "The marker for the recording was not saved.",
  },
  record: {
    sessionNotRecorded: (reason) => `session not recorded: ${reason}`,
    markerNotClaimed: ({ file, reason }) => `marker ${file} was not claimed: ${reason}`,
  },
  draft: {
    configNotRead: (reason) => `project config not read: ${reason}`,
    transcriptNotRead: ({ file, reason }) => `transcript ${file} not read: ${reason}`,
    transcriptsMissing: (count) => `transcripts not found: ${count}, their tokens are not counted`,
    transcriptCompressed: (file) =>
      `transcript ${file} is compressed by the agent and was not read: its tokens and texts are missing from the draft`,
    sessionTranscriptNotRead: (reason) =>
      `session transcript not read, there will be no prompt models or session messages: ${reason}`,
    stationTranscriptsMissing: (count) =>
      `station transcripts not found: ${count}, their reports and the tokens of these runs will be missing`,
    intervention: ({ reason, text }) => `intervention (${reason}): ${text}`,
    editNotCarried: (title) => `edit “${title}” was not carried over: no such event in the log`,
    assignmentNotFound: "assignment not found",
    draftFile: (file) => `draft: ${file}`,
    counts: ({ prompts, messages, interventions }) =>
      `prompts: ${prompts}, messages: ${messages}, interventions: ${interventions}`,
    build: ({ id, project, harness, workflow, runs, events }) =>
      `build ${id}: project ${project}, harness ${harness}, workflow ${workflow}, ` +
      `runs: ${runs}, events: ${events}`,
    unfilledHeader: ({ buildId, fields }) => `not filled in: build ${buildId}: ${fields}`,
    projectWithoutBuild: (project) =>
      `commands of project ${project} have no build: they go to the build by time`,
    directoryOutsideProject: (directory) =>
      `directory ${directory} does not belong to a Cyberzavod project: its stages and checks are not in the draft`,
    waiting: (count) => `awaiting editing: ${count}`,
    unassignedRuns: (count) => `station runs without a build (they go to the first): ${count}`,
    unassignedRun: ({ agent, run, clock, line }) => `${agent} ${run} ${clock}: ${line}`,
    orphanedRun: (run) => `run ${run} is listed in a build, but it is not in the log`,
    reroutedMessage: ({ line, from, to }) =>
      `the route of message “${line}” changed: ${from} → ${to}, reread the line`,
  },
  publish: {
    published: (file) => `published: ${file}`,
    notReady: ({ file, problems }) => `${file} is not ready to publish:\n${problems}`,
    buildProblem: ({ buildId, reason }) => `build ${buildId}: ${reason}`,
    cost: ({ usd, pricesAsOf }) =>
      `cost at API prices: ${formatUsd(usd)} (prices of ${pricesAsOf})`,
    costUnknown: (reason) => {
      switch (reason.type) {
        case "no_usage":
          return "cost unknown: the recording has no token usage";
        case "no_breakdown":
          return "cost unknown: the tokens are not broken down by kind";
        case "no_model":
          return "cost unknown: the model that spent the tokens is not recorded";
        case "unpriced_model":
          return `cost unknown: no price for model ${reason.model}`;
      }
    },
  },
  preview: {
    untitled: (buildId) => `Draft ${buildId}`,
    skipped: ({ file, buildId, reason }) =>
      `not shown: ${file}${buildId === undefined ? "" : `, build ${buildId}`}: ${reason}`,
  },
  errors: {
    fileConflicts: (files) =>
      `nothing was changed: these files are yours (not generated, or generated and then edited by hand): ${files}. Move your edits to AGENTS.md and delete the files, or overwrite them with ${CLI_COMMAND} sync --force`,
    settingsNotObject: (file) => `${file} cannot be parsed: the settings must be an object`,
    settingsNotParsed: ({ file, reason }) => `${file} cannot be parsed: ${reason}`,
    manifestNotParsed: ({ file, reason }) =>
      `${file} cannot be parsed: ${reason}. Restore it from git, or delete it and run ${CLI_COMMAND} sync`,
    unknownPlaceholder: (placeholder) => `the template has an unknown placeholder ${placeholder}`,
    projectNotFound: (directory) =>
      `${directory} is not in a Cyberzavod project: run ${CLI_COMMAND} init first`,
    noDrafts: `no drafts yet: run ${CLI_COMMAND} draft first`,
    noRawLogs: (directory) => `no session logs yet: the hooks write them to ${directory}`,
    earlierDraftNotParsed: (file) =>
      `the earlier draft ${file} cannot be parsed — fix or delete it`,
    noBuild: (buildId) => `the draft has no build ${buildId}`,
    buildHasNoEvents: (buildId) => `build ${buildId} has no events`,
    leaksFound: ({ buildId, leaks }) =>
      `the text to publish for build ${buildId} contains something that must not be shown: ${leaks}`,
    leakIn: ({ kind, text }) => `${kind} in “${text}”`,
  },
  leakKinds: {
    "ip-address": "IP address",
    "ipv6-address": "IPv6 address",
    email: "email or an address like user@host",
    "server-login": "server login",
    token: "token",
    "url-password": "password in a URL",
    "private-key": "private key",
    "user-path": "path with a user name",
  },
  headerFields: {
    title: "title",
    language: "language",
    project: "project",
    harness: "harness version",
    workflow: "workflow",
  },
};
