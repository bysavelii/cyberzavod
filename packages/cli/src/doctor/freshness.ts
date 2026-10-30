// Agent files check: what is generated in the project matches what the running CLI would build,
// the same way as `sync --check`.

import type { InterfaceLanguage } from "@cyberzavod/core";
import { PROJECT_CONFIG_FILE } from "@cyberzavod/storage";
import type { AgentAdapter } from "../agents/agent-adapter.ts";
import { inspectProjectFiles, type ProjectFilesInspection } from "../commands/sync.ts";
import { RULES_FILE } from "../commands/init.ts";
import { HARNESS_VERSION } from "../installation/installation.ts";
import type { DoctorMessages } from "../messages/cli-messages.ts";
import { failed, LIST_SEPARATOR, passed, type CheckResult, type ProjectCheck } from "./check.ts";

// Each agent recognizes only its own errors.
function describedByAdapters(
  err: unknown,
  adapters: readonly AgentAdapter[],
  language: InterfaceLanguage,
): string | undefined {
  const reasons = adapters.map((adapter) => adapter.describeError(err, language));

  return reasons.find((reason) => reason !== undefined);
}

function resultOf(inspection: ProjectFilesInspection, doctor: DoctorMessages): CheckResult {
  const { files } = doctor;
  const { report, configVersion, isHarnessOutdated } = inspection;
  const outdatedCount = report.added.length + report.updated.length + report.removed.length;
  const blocked = [...report.conflicts, ...report.edited];

  if (isHarnessOutdated) {
    return failed({
      problem: files.versionsDiffer({
        file: PROJECT_CONFIG_FILE,
        configVersion,
        cliVersion: HARNESS_VERSION,
      }),
      fix: files.matchVersion(configVersion),
    });
  }

  if (blocked.length > 0) {
    return failed({
      problem: files.writtenByHuman(blocked.join(LIST_SEPARATOR)),
      fix: files.moveToRules(RULES_FILE),
    });
  }

  if (outdatedCount > 0) {
    return failed({ problem: files.outdated(outdatedCount), fix: files.sync });
  }

  return passed(files.upToDate);
}

/** Agent files are current for the running version; the config and CLI versions agree. */
export const freshnessCheck: ProjectCheck = {
  id: "files",
  run: async ({ project, installation, messages, adapters, language }) => {
    const { files } = messages.doctor;

    try {
      const inspection = await inspectProjectFiles(project, installation, adapters);

      return resultOf(inspection, messages.doctor);
    } catch (err) {
      const reason = describedByAdapters(err, adapters, language);

      if (reason === undefined) throw err;

      return failed({ problem: files.cannotCheck(reason), fix: files.fixCause });
    }
  },
};
