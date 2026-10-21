// The project's Claude Code files, built from the harness and the project config: thin CLAUDE.md
// files on top of AGENTS.md, role agents, the harness skills, workflow skills, project settings and
// recording publishing. Only the texts live here; sync.ts decides what to do with them on disk.

import {
  harnessSkillFiles,
  MARKDOWN_GENERATED_COMMENT,
  ownStageSections,
  recordingTemplateValues,
  renderTemplate as renderKitTemplate,
  rolePrinciples,
  stageGuidesOf,
  stageTable,
  templateValues,
  workingRulesParagraphs,
  type GeneratedFile,
  type KitError,
  type RecordingFragments,
  type RecordingTerms,
} from "@cyberzavod/adapter-kit";
import {
  skillFrontmatter,
  type Harness,
  type ProjectConfig,
  type StageGuide,
  type StageRole,
  type Workflow,
} from "@cyberzavod/core";
import {
  claudeEffortOf,
  claudeModelOf,
  claudeToolsOf,
  ESCALATION_MODEL,
  type GenerateError,
} from "./claude.ts";

/** Adapter templates: texts that are not derived from the harness. */
export interface ClaudeTemplates {
  publishRecording: string;
  recordingEditor: string;
  setup: string;
  /** The recording texts every agent shares. */
  recordingFragments: RecordingFragments;
}

/** Everything the project's Claude Code files are built from. */
export interface ClaudeProject {
  config: ProjectConfig;
  harness: Harness;
  workflow: Workflow;
  /** Directories with AGENTS.md from the project root with `/`; the root is an empty string. */
  rules: string[];
  /** Adapter directories of raw logs and drafts from the project root with `/`. */
  capture: { raw: string; drafts: string };
  /** How to run the Cyberzavod CLI from the project root. */
  cli: string;
  templates: ClaudeTemplates;
}

// What the shared recording texts say differently in Claude Code: the skill call, where the skill
// lives, and the human's words that become interventions.
const RECORDING_TERMS: RecordingTerms = {
  feature: "/feature",
  publishSkill: ".claude/skills/publish-recording/SKILL.md",
  interventionWords:
    "an answer to a question through `AskUserQuestion` and the human's word after the automation stops",
};

const RULES_FILE = "AGENTS.md";
const ENTRYPOINT_FILE = "CLAUDE.md";
const SKILLS_DIRECTORY = ".claude/skills";

// The human starts the work with /feature: the harness skills stay out of the slash menu, and the
// model still opens them when the work calls for it.
const HARNESS_SKILL_FIELDS = { "user-invocable": "false" };

function joinPath(directory: string, file: string): string {
  return directory === "" ? file : `${directory}/${file}`;
}

function guidesOf(project: ClaudeProject): StageGuide[] {
  return stageGuidesOf(project.harness, project.workflow);
}

function rootEntrypoint(project: ClaudeProject): string {
  const { config, harness, workflow } = project;
  const rules = workingRulesParagraphs({
    config,
    harness,
    workflow,
    featureCall: "/feature <task>",
    agentsDirectory: ".claude/agents/",
    skillsDirectory: `${SKILLS_DIRECTORY}/`,
  });

  return [MARKDOWN_GENERATED_COMMENT, ...rules, `@${RULES_FILE}`].join("\n\n");
}

function nestedEntrypoint(): string {
  return `${MARKDOWN_GENERATED_COMMENT}\n\n@${RULES_FILE}`;
}

function entrypoints(project: ClaudeProject): GeneratedFile[] {
  return project.rules.map((directory) => ({
    path: joinPath(directory, ENTRYPOINT_FILE),
    content: `${directory === "" ? rootEntrypoint(project) : nestedEntrypoint()}\n`,
  }));
}

interface RoleAgent {
  guide: StageGuide;
  role: StageRole;
  model: string;
  /** The principles the role works by beyond the always-on rules of CLAUDE.md. */
  principles: readonly string[];
}

function agentFile(agent: RoleAgent): GeneratedFile {
  const { guide, role, model, principles } = agent;
  const instructions = [guide.body, ...principles].join("\n\n");
  const content = [
    "---",
    `name: ${role.name}`,
    `description: ${guide.description} The "${guide.title}" stage of /feature.`,
    `tools: ${claudeToolsOf(role.access)}`,
    `model: ${model}`,
    `effort: ${claudeEffortOf(guide.stage)}`,
    "---",
    MARKDOWN_GENERATED_COMMENT,
    "",
    instructions,
    "",
  ].join("\n");

  return { path: `.claude/agents/${role.name}.md`, content };
}

function roleAgents(project: ClaudeProject): GeneratedFile[] {
  const principles = rolePrinciples(project.harness);

  return guidesOf(project).flatMap((guide) => {
    if (guide.role === undefined) return [];

    const model = claudeModelOf(guide.stage, project.config.agents[guide.stage]);

    return [agentFile({ guide, role: guide.role, model, principles })];
  });
}

function harnessSkills(project: ClaudeProject): GeneratedFile[] {
  return harnessSkillFiles(project.harness.skills, {
    directory: SKILLS_DIRECTORY,
    agentFields: HARNESS_SKILL_FIELDS,
  });
}

function featureFrontmatter(project: ClaudeProject, guides: readonly StageGuide[]): string {
  const route = guides.map(({ title }) => title.toLowerCase()).join(", ");
  const frontmatter = skillFrontmatter({
    name: project.harness.lead.name,
    description: `Runs a task through the ${project.workflow.name} workflow — ${route}; each role has its own model. Usage: /feature <task>.`,
    metadata: {},
    agentFields: { "argument-hint": "<task>", "disable-model-invocation": "true" },
  });

  return `${frontmatter}\n${MARKDOWN_GENERATED_COMMENT}`;
}

function featureSkill(project: ClaudeProject): GeneratedFile {
  const guides = guidesOf(project);
  const modelOf = (guide: StageGuide) =>
    claudeModelOf(guide.stage, project.config.agents[guide.stage]);
  const content = [
    featureFrontmatter(project, guides),
    "# A task through the workflow",
    stageTable(guides, modelOf),
    project.harness.lead.body,
    `Stronger model for the second rework — \`${ESCALATION_MODEL}\`: pass \`model: "${ESCALATION_MODEL}"\` in the agent call.`,
    ...ownStageSections(guides),
  ].join("\n\n");

  return {
    path: `${SKILLS_DIRECTORY}/${project.harness.lead.name}/SKILL.md`,
    content: `${content}\n`,
  };
}

/**
 * Fills an adapter template with the generated mark, the CLI command, the journal directories and
 * the placeholder mark of the starter AGENTS.md.
 * @param {string} template Template text with `{{generated}}`, `{{cli}}`, `{{raw}}`, `{{drafts}}`,
 * `{{todo}}`.
 * @param {ClaudeProject} project Project.
 * @returns {string} Finished file text.
 * @throws {KitError} If the template has a placeholder the adapter does not know.
 */
export function renderTemplate(template: string, project: ClaudeProject): string {
  return renderKitTemplate(template, templateValues(project));
}

function setupSkill(project: ClaudeProject): GeneratedFile {
  return {
    path: ".claude/skills/setup/SKILL.md",
    content: renderTemplate(project.templates.setup, project),
  };
}

function recordingFiles(project: ClaudeProject): GeneratedFile[] {
  const values = recordingTemplateValues({
    cli: project.cli,
    capture: project.capture,
    fragments: project.templates.recordingFragments,
    terms: RECORDING_TERMS,
  });

  return [
    {
      path: ".claude/skills/publish-recording/SKILL.md",
      content: renderKitTemplate(project.templates.publishRecording, values),
    },
    {
      path: ".claude/agents/recording-editor.md",
      content: renderKitTemplate(project.templates.recordingEditor, values),
    },
  ];
}

/**
 * Builds all of the project's Claude Code files except the settings.
 * @param {ClaudeProject} project Config, harness, workflow, rule directories and templates.
 * @returns {GeneratedFile[]} Files by path from the project root.
 * @throws {GenerateError} If a stage is assigned to an agent this adapter does not run.
 */
export function claudeFiles(project: ClaudeProject): GeneratedFile[] {
  return [
    ...entrypoints(project),
    ...roleAgents(project),
    ...harnessSkills(project),
    featureSkill(project),
    setupSkill(project),
    ...recordingFiles(project),
  ];
}
