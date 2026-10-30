// Project rules check: the root AGENTS.md exists and the `init` starter in it is filled in.

import path from "node:path";
import { RULES_TODO_MARK } from "@cyberzavod/core";
import { RULES_FILE } from "../commands/init.ts";
import { readOptionalText } from "../files.ts";
import { failed, passed, type ProjectCheck } from "./check.ts";

/** The root AGENTS.md exists and carries no `RULES_TODO_MARK` placeholder marks. */
export const rulesCheck: ProjectCheck = {
  id: "rules",
  run: async ({ project, messages, adapters: [{ terms }] }) => {
    const { rules } = messages.doctor;
    const text = await readOptionalText(path.join(project.root, RULES_FILE));

    if (text === undefined) {
      return failed({ problem: rules.missing(RULES_FILE), fix: rules.create(terms) });
    }

    if (text.includes(RULES_TODO_MARK)) {
      return failed({ problem: rules.unfilled(RULES_FILE), fix: rules.fill(terms) });
    }

    return passed(rules.passed(RULES_FILE));
  },
};
