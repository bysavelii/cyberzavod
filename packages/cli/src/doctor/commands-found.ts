// Checks the check commands without running them: each command's program exists. Make targets and
// scripts are not checked by name, and a command starting with a shell builtin cannot be
// recognized.

import { PROJECT_CONFIG_FILE } from "@cyberzavod/storage";
import { failed, LIST_SEPARATOR, passed, type ProjectCheck, type ProjectContext } from "./check.ts";
import { noCommandsResult } from "./no-commands.ts";
import { programOf } from "./programs.ts";

function uniqueProgramsOf(commands: readonly string[]): string[] {
  const programs = commands.map((command) => programOf(command) ?? command);

  return [...new Set(programs)];
}

async function missingPrograms(
  programs: readonly string[],
  context: ProjectContext,
): Promise<string[]> {
  const missing: string[] = [];

  for (const program of programs) {
    const isAvailable = await context.isProgramAvailable(program, context.project.root);

    if (!isAvailable) missing.push(program);
  }

  return missing;
}

/** The programs of all `verification.commands` are found; the commands are not run. */
export const commandsFoundCheck: ProjectCheck = {
  id: "commands",
  run: async (context) => {
    const { commands } = context.messages.doctor;
    const configured = context.project.config.verification.commands;
    const [{ terms }] = context.adapters;

    if (configured.length === 0) return noCommandsResult(context.messages, terms);

    const programs = uniqueProgramsOf(configured);
    const missing = await missingPrograms(programs, context);

    if (missing.length === 0) return passed(commands.programsFound(programs.join(LIST_SEPARATOR)));

    return failed({
      problem: commands.programsMissing(missing.join(LIST_SEPARATOR)),
      fix: commands.fixPrograms(PROJECT_CONFIG_FILE),
    });
  },
};
