// Manifest of generated output: which files the generator wrote and with what contents, and which
// deny rules it added to the settings itself. With it sync and disconnect tell their own untouched
// file from their own hand-edited one, and their own deny rule from the same rule by the human.
// The manifest is shared by the agents connected to the project: each owns its own section.

import { createHash } from "node:crypto";
import { MARKER_DIRECTORY } from "@cyberzavod/storage";
import { KitError } from "../errors.ts";
import { isObject } from "../object.ts";

/** Manifest path from the project root with `/`. */
export const MANIFEST_FILE = `${MARKER_DIRECTORY}/generated.json`;

/** Manifest format version; not to be confused with the CLI and harness version. */
export const MANIFEST_SCHEMA_VERSION = 2;

const LEGACY_MANIFEST_SCHEMA_VERSION = 1;

const HASH_ALGORITHM = "sha256";

/** Manifest section of one agent: the output of its generator. */
export interface Manifest {
  /** Content fingerprint of each written file by path from the root with `/`. */
  files: Readonly<Record<string, string>>;
  /** Deny rules added by the generator, not the human: disconnect removes them. */
  deny: readonly string[];
}

/** Whose section of the manifest an adapter reads and writes. */
export interface ManifestOwner {
  /** Agent name: the key of its section. */
  agent: string;
  /**
   * Whether the generated file belongs to the agent. A manifest of version 1 has no sections, and
   * the agent takes from it the files it owns.
   */
  ownsFile(path: string): boolean;
}

/** Empty manifest: the generator has not written anything in the project yet. */
export const EMPTY_MANIFEST: Manifest = { files: {}, deny: [] };

// Line ending conversion on git checkout on Windows does not make a file hand-edited.
function withUnixNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

/**
 * Fingerprint of file contents; `\r\n` and `\n` give the same fingerprint.
 * @param {string} text File contents.
 * @returns {string} Fingerprint of the form `sha256:<hex>`.
 */
export function contentHash(text: string): string {
  const digest = createHash(HASH_ALGORITHM).update(withUnixNewlines(text)).digest("hex");

  return `${HASH_ALGORITHM}:${digest}`;
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isObject(value) && Object.values(value).every((hash) => typeof hash === "string");
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((rule) => typeof rule === "string");
}

function unreadable(reason: string): KitError {
  return new KitError((messages) =>
    messages.errors.manifestNotParsed({ file: MANIFEST_FILE, reason }),
  );
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw unreadable((err as Error).message);
  }
}

function parseSection(raw: unknown, where: string): Manifest {
  if (!isObject(raw)) throw unreadable(`${where} must be an object`);

  const { files = {}, settings = {} } = raw;

  if (!isStringRecord(files)) throw unreadable(`${where}files must map paths to hashes`);

  const deny = isObject(settings) ? settings.deny : undefined;

  if (!isStringList(deny ?? [])) {
    throw unreadable(`${where}settings.deny must be a list of strings`);
  }

  return { files, deny: deny === undefined ? [] : (deny as string[]) };
}

type Sections = Readonly<Record<string, Manifest>>;

function parseSections(raw: Record<string, unknown>): Sections {
  const { agents = {} } = raw;

  if (!isObject(agents)) throw unreadable("agents must be an object");

  const entries = Object.entries(agents).map(
    ([agent, section]) => [agent, parseSection(section, `agents.${agent}.`)] as const,
  );

  return Object.fromEntries(entries);
}

function parseDocument(text: string): Record<string, unknown> {
  const raw = parseJson(text);

  if (!isObject(raw)) throw unreadable("not an object");

  const { schemaVersion } = raw;

  if (
    schemaVersion !== MANIFEST_SCHEMA_VERSION &&
    schemaVersion !== LEGACY_MANIFEST_SCHEMA_VERSION
  ) {
    throw unreadable(`unsupported schemaVersion ${String(schemaVersion)}`);
  }

  return raw;
}

function isLegacy(document: Record<string, unknown>): boolean {
  return document.schemaVersion === LEGACY_MANIFEST_SCHEMA_VERSION;
}

function legacySection(document: Record<string, unknown>, owner: ManifestOwner): Manifest {
  const { files, deny } = parseSection(document, "");
  const ownedFiles = Object.fromEntries(
    Object.entries(files).filter(([file]) => owner.ownsFile(file)),
  );

  return { files: ownedFiles, deny };
}

/**
 * Parses the agent's section of the manifest text. A manifest of version 1 was written by the only
 * agent of the project: the agent takes the files it owns and the deny rules.
 * @param {string | undefined} text File contents; undefined if there is no file.
 * @param {ManifestOwner} owner The agent whose section is read.
 * @returns {Manifest} The section; empty if there is no file or no section.
 * @throws {KitError} If the text is not JSON, the format version is unknown, or fields have
 *   the wrong shape.
 */
export function parseManifest(text: string | undefined, owner: ManifestOwner): Manifest {
  if (text === undefined) return EMPTY_MANIFEST;

  const document = parseDocument(text);

  if (isLegacy(document)) return legacySection(document, owner);

  return parseSections(document)[owner.agent] ?? EMPTY_MANIFEST;
}

function sectionText(manifest: Manifest) {
  const paths = Object.keys(manifest.files).sort();
  const files = Object.fromEntries(paths.map((file) => [file, manifest.files[file]]));

  return { files, settings: { deny: [...manifest.deny].sort() } };
}

function documentText(sections: Sections): string {
  const agents = Object.fromEntries(
    Object.entries(sections).map(([agent, section]) => [agent, sectionText(section)]),
  );
  const document = { schemaVersion: MANIFEST_SCHEMA_VERSION, agents };

  return `${JSON.stringify(document, null, 2)}\n`;
}

// A manifest of version 1 gives its place to version 2 without sections: whose files it held is
// known only to the agent that wrote it, and that agent writes its own section.
function sectionsOf(previousText: string | undefined): Sections {
  if (previousText === undefined) return {};

  const document = parseDocument(previousText);

  return isLegacy(document) ? {} : parseSections(document);
}

/**
 * Manifest text with the agent's section replaced and the other agents' sections kept. Paths and
 * deny rules are in order, so the file does not change needlessly; a manifest of version 1 becomes
 * version 2 with the agent's section alone.
 * @param {string | undefined} previousText Manifest on disk; undefined if there is no file.
 * @param {ManifestOwner} owner The agent whose section is written.
 * @param {Manifest} manifest The agent's section.
 * @returns {string} JSON with a trailing newline.
 * @throws {KitError} If the previous text cannot be parsed.
 */
export function manifestTextWith(
  previousText: string | undefined,
  owner: ManifestOwner,
  manifest: Manifest,
): string {
  return documentText({ ...sectionsOf(previousText), [owner.agent]: manifest });
}

/**
 * Manifest text without the agent's section; the other agents' sections stay. A manifest of
 * version 1 had one agent, so nothing stays of it.
 * @param {string | undefined} previousText Manifest on disk; undefined if there is no file.
 * @param {ManifestOwner} owner The agent whose section is removed.
 * @returns {string | undefined} JSON with a trailing newline; undefined if no section remains and
 *   the file is to be deleted.
 * @throws {KitError} If the previous text cannot be parsed.
 */
export function manifestTextWithout(
  previousText: string | undefined,
  owner: ManifestOwner,
): string | undefined {
  const others = Object.entries(sectionsOf(previousText)).filter(
    ([agent]) => agent !== owner.agent,
  );

  return others.length === 0 ? undefined : documentText(Object.fromEntries(others));
}
