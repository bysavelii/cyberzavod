// The Agent Skills format (https://agentskills.io/specification): a skill is a directory with
// SKILL.md — YAML front matter and instructions — and files beside it that the agent opens when it
// needs them. Here is the subset of the format the harness uses: `name`, `description` and a flat
// `metadata` map of strings, read and written the same way.

import { isLine } from "./guards.ts";

/** The skill's main file: front matter and instructions. */
export const SKILL_FILE = "SKILL.md";

const NAME_MAX_LENGTH = 64;
const DESCRIPTION_MAX_LENGTH = 1024;
// Lowercase letters, digits and single hyphens between them, as the specification requires.
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FIELD_KEY = /^[a-z][a-z0-9-]*$/;
const FRONTMATTER = /^---\n([\s\S]*?)\n---(?:\n|$)/;
const TOP_LEVEL_FIELD = /^([^\s:][^:]*):(?:\s+(.*))?$/;
const METADATA_FIELD = /^ {2}([^\s:][^:]*):(?:\s+(.*))?$/;
const METADATA = "metadata";

/** A skill's main file: who it is, when to use it, extra string fields, and the instructions. */
export interface SkillDocument {
  /** Skill name: the name of its directory too. */
  name: string;
  /** What the skill does and when to use it: the agent picks skills by it. */
  description: string;
  /** Extra fields of the harness, for example the stage a skill belongs to. */
  metadata: Readonly<Record<string, string>>;
  /** Instructions after the front matter. */
  body: string;
}

/** Skill format error: a SKILL.md failed validation. */
export class SkillError extends Error {}

function quotedValue(raw: string): string {
  try {
    return JSON.parse(raw) as string;
  } catch (err) {
    throw new SkillError(`value ${raw} is not a valid double-quoted string`, { cause: err });
  }
}

function scalarOf(raw: string | undefined): string {
  const value = (raw ?? "").trim();

  if (value.startsWith('"')) return quotedValue(value);
  if (value.startsWith("'") && value.endsWith("'") && value.length > 1) {
    return value.slice(1, -1).replaceAll("''", "'");
  }

  return value;
}

interface Frontmatter {
  fields: Map<string, string>;
  metadata: Record<string, string>;
}

function keyOf(raw: string | undefined, line: string): string {
  const key = (raw ?? "").trim();

  if (!FIELD_KEY.test(key)) throw new SkillError(`front matter line «${line}» has a bad key`);

  return key;
}

function frontmatterFields(lines: readonly string[]): Frontmatter {
  const fields = new Map<string, string>();
  const metadata: Record<string, string> = {};
  let isInMetadata = false;

  for (const line of lines) {
    const metadataField = METADATA_FIELD.exec(line);

    if (isInMetadata && metadataField !== null) {
      metadata[keyOf(metadataField[1], line)] = scalarOf(metadataField[2]);
      continue;
    }

    const field = TOP_LEVEL_FIELD.exec(line);

    if (field === null) throw new SkillError(`front matter line «${line}» is not a field`);

    const key = keyOf(field[1], line);

    isInMetadata = key === METADATA;
    if (!isInMetadata) fields.set(key, scalarOf(field[2]));
  }

  return { fields, metadata };
}

function requiredName(fields: ReadonlyMap<string, string>): string {
  const name = fields.get("name") ?? "";

  if (name.length > NAME_MAX_LENGTH || !SKILL_NAME.test(name)) {
    throw new SkillError(
      `name «${name}» must be 1–${NAME_MAX_LENGTH} lowercase letters, digits and single hyphens`,
    );
  }

  return name;
}

function requiredDescription(fields: ReadonlyMap<string, string>, name: string): string {
  const description = fields.get("description");

  if (!isLine(description) || description.length > DESCRIPTION_MAX_LENGTH) {
    throw new SkillError(
      `skill ${name}: description must be one line of 1–${DESCRIPTION_MAX_LENGTH} characters`,
    );
  }

  return description;
}

function rejectUnknownFields(fields: ReadonlyMap<string, string>, name: string): void {
  const unknown = [...fields.keys()].filter((key) => key !== "name" && key !== "description");

  if (unknown.length > 0) {
    throw new SkillError(
      `skill ${name}: front matter field ${unknown.join(", ")} is not supported`,
    );
  }
}

/**
 * Parses a SKILL.md: YAML front matter between `---` lines and the instructions after it.
 * @param {string} text File contents.
 * @returns {SkillDocument} The skill's name, description, metadata and instructions.
 * @throws {SkillError} If the front matter is missing or malformed, the name or description breaks
 *   the specification, or a field other than `name`, `description` and `metadata` is present.
 */
export function parseSkillDocument(text: string): SkillDocument {
  const normalized = text.replace(/\r\n/g, "\n");
  const match = FRONTMATTER.exec(normalized);

  if (match === null) throw new SkillError("no front matter between --- lines");

  const lines = (match[1] ?? "").split("\n");
  const { fields, metadata } = frontmatterFields(lines);
  const name = requiredName(fields);
  const description = requiredDescription(fields, name);

  rejectUnknownFields(fields, name);

  return { name, description, metadata, body: normalized.slice(match[0].length).trim() };
}

const PLAIN_START = /^[^\s\-?:,[\]{}#&*!|>'"%@`]/;
const RESERVED_SCALAR = /^(?:true|false|yes|no|on|off|null|~|[-+.]?\d.*)$/i;

function isPlainSafe(value: string): boolean {
  const isTrimmed = value === value.trim();
  const hasIndicator = value.includes(": ") || value.includes(" #") || value.endsWith(":");

  return isTrimmed && PLAIN_START.test(value) && !hasIndicator && !RESERVED_SCALAR.test(value);
}

/**
 * A string as a YAML scalar: plain when YAML reads it back as the same string, double-quoted
 * otherwise.
 * @param {string} value The string.
 * @returns {string} The scalar for a front matter line.
 */
export function yamlString(value: string): string {
  return isPlainSafe(value) ? value : JSON.stringify(value);
}

/** What a written front matter holds: the skill's fields and an agent's own extra fields. */
export interface SkillFrontmatter {
  name: string;
  description: string;
  metadata: Readonly<Record<string, string>>;
  /**
   * Fields one agent understands and the specification does not, written as given after the
   * description: `argument-hint: <task>`.
   */
  agentFields: Readonly<Record<string, string>>;
}

/**
 * Writes the front matter of a SKILL.md, `---` lines included.
 * @param {SkillFrontmatter} frontmatter The skill's fields and the agent's extra fields.
 * @returns {string} Front matter lines joined by line breaks, without a trailing one.
 */
export function skillFrontmatter(frontmatter: SkillFrontmatter): string {
  const { name, description, metadata, agentFields } = frontmatter;
  const agentLines = Object.entries(agentFields).map(([key, value]) => `${key}: ${value}`);
  const metadataEntries = Object.entries(metadata);
  const metadataLines = metadataEntries.map(([key, value]) => `  ${key}: ${yamlString(value)}`);
  const metadataBlock = metadataEntries.length === 0 ? [] : [`${METADATA}:`, ...metadataLines];

  return [
    "---",
    `name: ${name}`,
    `description: ${yamlString(description)}`,
    ...agentLines,
    ...metadataBlock,
    "---",
  ].join("\n");
}
