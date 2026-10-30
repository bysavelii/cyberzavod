// Adapter templates: texts that are not derived from the harness, with `{{name}}` placeholders.

import { RULES_TODO_MARK } from "@cyberzavod/core";
import { KitError } from "../errors.ts";
import { MARKDOWN_GENERATED_COMMENT } from "./marks.ts";

const PLACEHOLDER = /\{\{(\w+)\}\}/g;

/**
 * Fills a template's placeholders.
 * @param {string} template Template text with `{{name}}` placeholders.
 * @param {Readonly<Record<string, string>>} values Placeholder values by name.
 * @returns {string} Finished text.
 * @throws {KitError} If the template has a placeholder without a value.
 */
export function renderTemplate(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(PLACEHOLDER, (placeholder, name: string) => {
    const value = values[name];

    if (value === undefined) {
      throw new KitError((messages) => messages.errors.unknownPlaceholder(placeholder));
    }

    return value;
  });
}

/** What the placeholders of the adapter templates are filled with. */
export interface TemplateSource {
  /** How to run the Cyberzavod CLI from the project root. */
  cli: string;
  /** Adapter directories of raw logs and drafts from the project root with `/`. */
  capture: { raw: string; drafts: string };
}

/**
 * Values of the placeholders every adapter template may use: `{{generated}}` (the mark of a
 * Markdown file), `{{cli}}`, `{{raw}}`, `{{drafts}}` and `{{todo}}` (the placeholder mark of the
 * starter AGENTS.md).
 * @param {TemplateSource} source The CLI command and the journal directories.
 * @returns {Record<string, string>} Values by placeholder name.
 */
export function templateValues(source: TemplateSource): Record<string, string> {
  return {
    generated: MARKDOWN_GENERATED_COMMENT,
    cli: source.cli,
    raw: source.capture.raw,
    drafts: source.capture.drafts,
    todo: RULES_TODO_MARK,
  };
}

/** Texts the adapters share for the recording skill and the editor agent, with placeholders. */
export interface RecordingFragments {
  /** The recording rules: from several tasks in one session to the end of the skill. */
  rules: string;
  /** The editor agent's instructions, without the front matter the agent's format needs. */
  editor: string;
}

/** What differs between agents in the shared recording texts. */
export interface RecordingTerms {
  /** The call of the workflow skill, `{{feature}}` in the fragments. */
  feature: string;
  /** The recording skill's file from the project root, `{{publishSkill}}`. */
  publishSkill: string;
  /** The human's words that become interventions, `{{interventionWords}}`. */
  interventionWords: string;
  /** The flag that names the agent for `draft` and `publish`, `{{agentFlag}}`: `--agent <name>`. */
  agentFlag: string;
}

/** What the placeholders of the recording templates are filled with. */
export interface RecordingTemplateSource extends TemplateSource {
  fragments: RecordingFragments;
  terms: RecordingTerms;
}

/**
 * Values of the placeholders of the recording skill and editor templates: those of any adapter
 * template, the agent's terms, and the shared fragments `{{recordingRules}}` and
 * `{{recordingEditor}}`, which are filled with the same values first.
 * @param {RecordingTemplateSource} source The CLI command, the journal directories, the shared
 *   fragments and the agent's terms.
 * @returns {Record<string, string>} Values by placeholder name.
 * @throws {KitError} If a fragment has a placeholder without a value.
 */
export function recordingTemplateValues(source: RecordingTemplateSource): Record<string, string> {
  const values = { ...templateValues(source), ...source.terms };

  return {
    ...values,
    recordingRules: renderTemplate(source.fragments.rules, values),
    recordingEditor: renderTemplate(source.fragments.editor, values),
  };
}
