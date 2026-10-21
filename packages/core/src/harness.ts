// Harness is the development process in text: a set of Agent Skills — the lead, a skill per stage,
// the principles — and the workflows. Here is the model of these texts and their parsing; where to
// get the texts (a directory on disk or built into the CLI bundle) is decided by other packages.

import { isLine } from "./guards.ts";
import { parseSkillDocument, SKILL_FILE, SkillError, type SkillDocument } from "./skill.ts";
import { isStage, parseWorkflow, STAGES, type Stage, type Workflow } from "./stage.ts";

/** What a stage role may do: only read, or also change files. */
export const STAGE_ACCESS = ["read", "write"] as const;

/** A stage role's access to the project files. */
export type StageAccess = (typeof STAGE_ACCESS)[number];

/** Stage role: the agent the lead hands work to. */
export interface StageRole {
  /** Role name, for example `analyst`; the adapter names the agent file after it. */
  name: string;
  access: StageAccess;
}

/** A file of a skill beside SKILL.md: the path from the skill directory with `/`, and the text. */
export interface SkillFile {
  path: string;
  text: string;
}

/** A harness skill: its SKILL.md and the files beside it. */
export interface HarnessSkill extends SkillDocument {
  /** Files beside SKILL.md, sorted by path. */
  files: SkillFile[];
}

/** Stage description from the stage's skill. */
export interface StageGuide {
  stage: Stage;
  /** Stage title for people. */
  title: string;
  /** What the stage does and when: the description of its skill. */
  description: string;
  /** Stage role; a stage the lead runs itself has none. */
  role?: StageRole;
  /** Instructions for the role or the lead: the body of the stage's skill. */
  body: string;
  /** Name of the stage's skill. */
  skill: string;
}

/** Principle from the principles skill: the reference file name without extension, and the text. */
export interface Principle {
  name: string;
  text: string;
  /** Whether the principle holds in every context, not only when the skill is opened. */
  isAlwaysOn: boolean;
}

/** The whole harness: the lead, the skills, principles, stages and workflows. */
export interface Harness {
  /** The lead's skill: how a task goes through the stages. */
  lead: HarnessSkill;
  /** All skills but the lead, sorted by name: an adapter puts them into the project as they are. */
  skills: HarnessSkill[];
  principles: Principle[];
  stages: Record<Stage, StageGuide>;
  workflows: Workflow[];
}

/** Harness error: a skill or workflow file failed validation. */
export class HarnessError extends Error {}

/**
 * Harness files: path from the harness root with `/` → text. This way the harness arrives the same
 * from a directory on disk and from the CLI bundle where it is built in.
 */
export type HarnessFiles = Readonly<Record<string, string>>;

/** Name of the lead's skill. */
export const LEAD_SKILL = "feature";

/** Name of the principles skill. */
export const PRINCIPLES_SKILL = "principles";

const SKILLS_DIRECTORY = "skills/";
const WORKFLOWS = "workflows/";
const MARKDOWN = ".md";
const JSON_EXTENSION = ".json";
const REFERENCES = "references/";
const ALWAYS_ON = "always-on";
const ROLE_NAME = /^[a-z][a-z-]*$/;
const LIST_SEPARATOR = /[\s,]+/;

function compareNames(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;

  return 0;
}

// Files directly in the directory, not nested: sorted by name so the texts do not depend on the
// order the disk returned them in.
function filesIn(files: HarnessFiles, directory: string, extension: string): [string, string][] {
  const matching = Object.entries(files).filter(
    ([path]) => path.startsWith(directory) && path.endsWith(extension),
  );
  const named = matching.map(([path, text]): [string, string] => [
    path.slice(directory.length, -extension.length),
    text,
  ]);
  const direct = named.filter(([name]) => !name.includes("/"));

  return direct.sort(([left], [right]) => compareNames(left, right));
}

function workflowFrom(name: string, text: string): Workflow {
  let raw: unknown;

  try {
    raw = JSON.parse(text);
  } catch (err) {
    throw new HarnessError(`workflow ${name}: not JSON`, { cause: err });
  }

  const workflow = parseWorkflow(raw);

  if (workflow.name !== name) {
    throw new HarnessError(`workflow ${name}: name must match the file name`);
  }

  return workflow;
}

// Skill files by directory: `skills/<directory>/<path>` → path inside the directory and text.
function skillDirectories(files: HarnessFiles): Map<string, SkillFile[]> {
  const directories = new Map<string, SkillFile[]>();
  const skillPaths = Object.keys(files).filter((path) => path.startsWith(SKILLS_DIRECTORY));

  for (const path of skillPaths.sort(compareNames)) {
    const [directory = "", ...rest] = path.slice(SKILLS_DIRECTORY.length).split("/");
    const skillFiles = directories.get(directory) ?? [];

    skillFiles.push({ path: rest.join("/"), text: files[path] ?? "" });
    directories.set(directory, skillFiles);
  }

  return directories;
}

function documentOf(directory: string, text: string): SkillDocument {
  try {
    return parseSkillDocument(text);
  } catch (err) {
    if (err instanceof SkillError) {
      throw new HarnessError(`skill ${directory}: ${err.message}`, { cause: err });
    }

    throw err;
  }
}

// Only Markdown beside SKILL.md: the files go into the project as they are, each with the mark of
// a generated file, and only Markdown can carry it without changing what the file means.
function rejectOtherFiles(directory: string, files: readonly SkillFile[]): void {
  const other = files.filter(({ path }) => !path.endsWith(MARKDOWN));

  if (other.length > 0) {
    const paths = other.map(({ path }) => path).join(", ");

    throw new HarnessError(`skill ${directory}: only Markdown files are supported, not ${paths}`);
  }
}

function skillOf(directory: string, files: readonly SkillFile[]): HarnessSkill {
  const main = files.find(({ path }) => path === SKILL_FILE);

  if (main === undefined) throw new HarnessError(`skill ${directory}: no ${SKILL_FILE}`);

  const document = documentOf(directory, main.text);

  if (document.name !== directory) {
    throw new HarnessError(`skill ${directory}: name must match the directory name`);
  }

  const beside = files.filter((file) => file !== main);

  rejectOtherFiles(directory, beside);

  return { ...document, files: beside.map(({ path, text }) => ({ path, text: text.trim() })) };
}

function isStageAccess(value: unknown): value is StageAccess {
  return (STAGE_ACCESS as readonly unknown[]).includes(value);
}

function roleOf(skill: HarnessSkill): StageRole | undefined {
  const { role: name, access } = skill.metadata;

  if (name === undefined) return undefined;
  if (!ROLE_NAME.test(name)) {
    throw new HarnessError(
      `skill ${skill.name}: role must contain only lowercase Latin letters and «-»`,
    );
  }
  if (!isStageAccess(access)) {
    throw new HarnessError(`skill ${skill.name}: access must be ${STAGE_ACCESS.join(" or ")}`);
  }

  return { name, access };
}

function stageGuideOf(skill: HarnessSkill, stage: Stage): StageGuide {
  const { title } = skill.metadata;

  if (!isLine(title)) throw new HarnessError(`skill ${skill.name}: metadata needs a title`);

  const guide = { stage, title, description: skill.description, body: skill.body };
  const role = roleOf(skill);

  return role === undefined
    ? { ...guide, skill: skill.name }
    : { ...guide, role, skill: skill.name };
}

function stageOf(skill: HarnessSkill): Stage | undefined {
  const { stage } = skill.metadata;

  if (stage === undefined) return undefined;
  if (!isStage(stage)) throw new HarnessError(`skill ${skill.name}: unknown stage ${stage}`);

  return stage;
}

function stageGuides(skills: readonly HarnessSkill[]): Record<Stage, StageGuide> {
  const guides = new Map<Stage, StageGuide>();

  for (const skill of skills) {
    const stage = stageOf(skill);

    if (stage === undefined) continue;
    if (guides.has(stage)) throw new HarnessError(`stage ${stage} has more than one skill`);

    guides.set(stage, stageGuideOf(skill, stage));
  }

  const missing = STAGES.filter((stage) => !guides.has(stage));

  if (missing.length > 0) throw new HarnessError(`stage ${missing.join(", ")} has no skill`);

  const inStageOrder = STAGES.map((stage) => [stage, guides.get(stage)]);

  return Object.fromEntries(inStageOrder) as Record<Stage, StageGuide>;
}

function requiredSkill(skills: readonly HarnessSkill[], name: string): HarnessSkill {
  const skill = skills.find((candidate) => candidate.name === name);

  if (skill === undefined) throw new HarnessError(`harness has no skill ${name}`);

  return skill;
}

function alwaysOnNames(skill: HarnessSkill): Set<string> {
  const listed = skill.metadata[ALWAYS_ON] ?? "";
  const names = listed.split(LIST_SEPARATOR).filter((name) => name !== "");

  return new Set(names);
}

// Every principle is a reference file the skill's instructions link to: an agent that opens the
// skill finds a principle only through that link.
function rejectUnlinkedReferences(skill: HarnessSkill, references: readonly SkillFile[]): void {
  const unlinked = references.filter(({ path }) => !skill.body.includes(`(${path})`));

  if (unlinked.length > 0) {
    const paths = unlinked.map(({ path }) => path).join(", ");

    throw new HarnessError(`skill ${skill.name}: instructions do not link ${paths}`);
  }
}

function rejectUnknownAlwaysOn(skill: HarnessSkill, principles: readonly Principle[]): void {
  const known = new Set(principles.map(({ name }) => name));
  const unknown = [...alwaysOnNames(skill)].filter((name) => !known.has(name));

  if (unknown.length > 0) {
    throw new HarnessError(
      `skill ${skill.name}: ${ALWAYS_ON} names no principle ${unknown.join(", ")}`,
    );
  }
}

function principlesOf(skill: HarnessSkill): Principle[] {
  const references = skill.files.filter(({ path }) => path.startsWith(REFERENCES));
  const alwaysOn = alwaysOnNames(skill);

  return references.map(({ path, text }) => {
    const name = path.slice(REFERENCES.length, -MARKDOWN.length);

    return { name, text, isAlwaysOn: alwaysOn.has(name) };
  });
}

function validPrinciplesOf(skill: HarnessSkill): Principle[] {
  const references = skill.files.filter(({ path }) => path.startsWith(REFERENCES));
  const principles = principlesOf(skill);

  rejectUnlinkedReferences(skill, references);
  rejectUnknownAlwaysOn(skill, principles);

  return principles;
}

/**
 * Builds the harness from its files: the skills in `skills/<name>/` and the workflows in
 * `workflows/`.
 * @param {HarnessFiles} files Harness files.
 * @returns {Harness} Harness.
 * @throws {HarnessError} If a skill fails validation, the lead or principles skill is missing, a
 *   stage has no skill or more than one, or a workflow fails validation.
 */
export function parseHarness(files: HarnessFiles): Harness {
  const directories = [...skillDirectories(files)];
  const allSkills = directories.map(([directory, skillFiles]) => skillOf(directory, skillFiles));
  const lead = requiredSkill(allSkills, LEAD_SKILL);
  const principles = validPrinciplesOf(requiredSkill(allSkills, PRINCIPLES_SKILL));
  const workflows = filesIn(files, WORKFLOWS, JSON_EXTENSION).map(([name, text]) =>
    workflowFrom(name, text),
  );

  return {
    lead,
    skills: allSkills.filter((skill) => skill !== lead),
    principles,
    stages: stageGuides(allSkills),
    workflows,
  };
}
