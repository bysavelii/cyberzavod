// The harness skills as files of the project: every agent that reads Agent Skills gets the same
// skill, and only the place and the agent's own front matter fields differ. The texts are copied,
// not rewritten; the mark of a generated file goes right after the front matter.

import { SKILL_FILE, skillFrontmatter, type HarnessSkill } from "@cyberzavod/core";
import { MARKDOWN_GENERATED_COMMENT, type GeneratedFile } from "./marks.ts";

/** Where an agent reads skills and what it adds to the front matter of each. */
export interface SkillPlacement {
  /** Directory of the skills from the project root with `/`, without a trailing `/`. */
  directory: string;
  /** Fields only this agent understands, the same for every harness skill. */
  agentFields: Readonly<Record<string, string>>;
}

function mainFile(skill: HarnessSkill, placement: SkillPlacement): GeneratedFile {
  const frontmatter = skillFrontmatter({
    name: skill.name,
    description: skill.description,
    metadata: skill.metadata,
    agentFields: placement.agentFields,
  });

  return {
    path: `${placement.directory}/${skill.name}/${SKILL_FILE}`,
    content: `${frontmatter}\n${MARKDOWN_GENERATED_COMMENT}\n\n${skill.body}\n`,
  };
}

function besideFiles(skill: HarnessSkill, placement: SkillPlacement): GeneratedFile[] {
  return skill.files.map(({ path, text }) => ({
    path: `${placement.directory}/${skill.name}/${path}`,
    content: `${MARKDOWN_GENERATED_COMMENT}\n\n${text}\n`,
  }));
}

/**
 * Files of the harness skills in the project: SKILL.md and the files beside it.
 * @param {readonly HarnessSkill[]} skills The skills to put into the project.
 * @param {SkillPlacement} placement Where the agent reads skills and its extra fields.
 * @returns {GeneratedFile[]} Files by path from the project root.
 */
export function harnessSkillFiles(
  skills: readonly HarnessSkill[],
  placement: SkillPlacement,
): GeneratedFile[] {
  return skills.flatMap((skill) => [mainFile(skill, placement), ...besideFiles(skill, placement)]);
}
