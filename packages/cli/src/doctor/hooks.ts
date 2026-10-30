// Agent hooks check: the agent's hooks file has the handlers of the version in the config.

import type { InterfaceLanguage } from "@cyberzavod/core";
import type { AgentAdapter, AgentHooksReading } from "../agents/agent-adapter.ts";
import type { DoctorMessages } from "../messages/cli-messages.ts";
import { failed, LIST_SEPARATOR, passed, type CheckResult, type ProjectCheck } from "./check.ts";

interface HooksOutcome {
  reading: AgentHooksReading;
  file: string;
  version: string;
  doctor: DoctorMessages;
  language: InterfaceLanguage;
}

function resultOf({ reading, file, version, doctor, language }: HooksOutcome): CheckResult {
  const { hooks } = doctor;

  switch (reading.kind) {
    case "installed":
      return passed(hooks.passed(version));
    case "missing":
      return failed({ problem: hooks.missing(file), fix: hooks.sync });
    case "otherVersion":
      return failed({
        problem: hooks.otherVersion({
          file,
          found: reading.found.join(LIST_SEPARATOR),
          configVersion: version,
        }),
        fix: hooks.sync,
      });
    case "incomplete":
      return failed({
        problem: hooks.incomplete(reading.events.join(LIST_SEPARATOR)),
        fix: hooks.sync,
      });
    case "unreadable":
      return failed({
        problem: hooks.unreadable(reading.describe(language)),
        fix: hooks.repairSettings(file),
      });
  }
}

/**
 * The hooks of the agent in its hooks file match the version from the config.
 * @param {AgentAdapter} adapter The agent whose hooks are checked.
 * @returns {ProjectCheck} The check.
 */
export function hooksCheckFor(adapter: AgentAdapter): ProjectCheck {
  return {
    id: "hooks",
    run: async ({ project, messages, language }) => {
      const version = project.config.harness;
      const reading = await adapter.inspectHooks(project.root, version);

      return resultOf({
        reading,
        file: adapter.hooksFile,
        version,
        doctor: messages.doctor,
        language,
      });
    },
  };
}
