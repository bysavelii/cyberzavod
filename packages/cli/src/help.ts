// CLI help: the general list of commands by section and the help of a single command.

import { CLI_COMMAND } from "@cyberzavod/adapter-kit";
import { INTERFACE_LANGUAGES } from "@cyberzavod/core";
import {
  COMMAND_NAMES,
  COMMAND_SECTIONS,
  type CliMessages,
  type CommandName,
  type CommandParameter,
  type CommandSection,
} from "./messages/cli-messages.ts";

/**
 * Where a command is in the help: a list section, or `service`, a service command outside the list.
 */
export type CommandPlacement = CommandSection | "service";

/** A command with its place in the help. */
export interface PlacedCommand {
  section: CommandPlacement;
}

const LIST_INDENT = "  ";
const COLUMN_GAP = "  ";

function columnWidth(names: readonly string[]): number {
  return Math.max(...names.map((name) => name.length));
}

// A line like `  <name>  <description>`: the name is padded with spaces to the column width.
function alignedRow({ name, description }: CommandParameter, width: number): string {
  return `${LIST_INDENT}${name.padEnd(width)}${COLUMN_GAP}${description}`;
}

/**
 * Command names the general help shows: without service commands, in `COMMAND_NAMES` order.
 * @param {Readonly<Record<CommandName, PlacedCommand>>} commands Commands and their help places.
 * @returns {CommandName[]} Visible names.
 */
export function listedCommandNames(
  commands: Readonly<Record<CommandName, PlacedCommand>>,
): CommandName[] {
  return COMMAND_NAMES.filter((name) => commands[name].section !== "service");
}

/**
 * General help: where to start, commands by section and how to learn more.
 * @param {CliMessages} messages Messages in the chosen language.
 * @param {Readonly<Record<CommandName, PlacedCommand>>} commands Commands and their help places.
 * @returns {string} The help.
 */
export function generalHelp(
  messages: CliMessages,
  commands: Readonly<Record<CommandName, PlacedCommand>>,
): string {
  const listed = listedCommandNames(commands);
  const width = columnWidth(listed);

  const sections = COMMAND_SECTIONS.map((section) => {
    const names = listed.filter((name) => commands[name].section === section);
    const lines = names.map((name) =>
      alignedRow({ name, description: messages.commands[name].summary }, width),
    );

    return [messages.help.sections[section], ...lines].join("\n");
  });
  const footer = messages.help.footer(INTERFACE_LANGUAGES.join("|"));

  const parts = [messages.help.title, messages.help.quickStart, "", sections.join("\n\n"), footer];

  return parts.join("\n");
}

/**
 * Help of a single command: the usage line, description and parameters.
 * @param {CommandName} name The command.
 * @param {CliMessages} messages Messages in the chosen language.
 * @returns {string} The command help.
 */
export function commandHelp(name: CommandName, messages: CliMessages): string {
  const { usage, summary, parameters } = messages.commands[name];
  const head = `${CLI_COMMAND} ${usage}\n${summary}`;

  if (parameters.length === 0) return head;

  const width = columnWidth(parameters.map((parameter) => parameter.name));
  const lines = parameters.map((parameter) => alignedRow(parameter, width));

  return `${head}\n\n${messages.help.parametersTitle}\n${lines.join("\n")}`;
}
