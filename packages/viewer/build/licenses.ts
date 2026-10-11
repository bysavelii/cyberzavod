// The floor's build gathers the licenses of the third-party packages whose code and fonts end up
// in it: the bundle drops their license comments, so the notices go beside it in
// `THIRD_PARTY_LICENSES`.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

/** File name of the notices in the build output. */
export const LICENSES_FILE = "THIRD_PARTY_LICENSES";

// Vite module ids use "/" on every system, while a path read from disk on Windows has "\".
const NODE_MODULES = "/node_modules/";
const NOTICE_FILE_NAME = /^(licen[sc]e|notice)([-_.].+)?$/i;
const NOTICE_SEPARATOR = "\n\n----------------------------------------\n\n";

/**
 * Directory of the installed package a module belongs to.
 * @param {string} moduleId Absolute path of a module with "/" or "\" separators, possibly with a
 *   query (`?inline`).
 * @returns {string | undefined} The package directory with "/" separators, or `undefined` for a
 *   module of the repository itself.
 */
export function packageDirectoryOf(moduleId: string): string | undefined {
  const file = (moduleId.split("?")[0] ?? moduleId).replaceAll("\\", "/");
  const index = file.lastIndexOf(NODE_MODULES);

  if (index === -1) return undefined;

  const root = file.slice(0, index + NODE_MODULES.length);
  const inside = file.slice(root.length).split("/");
  const nameLength = inside[0]?.startsWith("@") ? 2 : 1;

  return `${root}${inside.slice(0, nameLength).join("/")}`;
}

// The full MIT text for a package that ships none: only the copyright line differs.
function mitLicenseText(copyright: string): string {
  return `MIT License

Copyright (c) ${copyright}

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
associated documentation files (the "Software"), to deal in the Software without restriction,
including without limitation the rights to use, copy, modify, merge, publish, distribute,
sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial
portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.`;
}

/** A package that ships no license file: the license it declares and its copyright holder. */
interface UnlicensedPackage {
  /** SPDX id the manifest declares; it must be the license the text is for. */
  license: "MIT";
  /** The author's name from the manifest, without the contact: the manifest is the only source. */
  author: string;
}

// Packages without a license file, only a `license` field in the manifest. Each one is listed by
// hand after a look at the package; any other package without a file fails the build.
const PACKAGES_WITHOUT_LICENSE_FILE: ReadonlyMap<string, UnlicensedPackage> = new Map([
  ["@pixi/colord", { license: "MIT", author: "Vlad Shilov" }],
]);

interface PackageManifest {
  name: string;
  version: string;
  license: string;
  author?: string | { name: string };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// The `license` field is a string, or in old packages an object `{ type }`.
function licenseOf(manifest: Record<string, unknown>): string | undefined {
  const { license } = manifest;

  if (typeof license === "string" && license !== "") return license;

  return isObject(license) && typeof license["type"] === "string" ? license["type"] : undefined;
}

function manifestOf(raw: unknown, directory: string): PackageManifest {
  if (!isObject(raw) || typeof raw["name"] !== "string" || typeof raw["version"] !== "string") {
    throw new Error(`the manifest of ${directory} has no name or version`);
  }

  const license = licenseOf(raw);

  if (license === undefined) {
    throw new Error(`the manifest of ${raw["name"]} has no valid "license" field: ${directory}`);
  }

  const author = raw["author"] as PackageManifest["author"];

  return { name: raw["name"], version: raw["version"], license, author };
}

// The `author` string form is "Name <email> (url)"; only the name goes into the notice.
const AUTHOR_CONTACT = /\s*[<(].*$/;

function authorNameOf(author: PackageManifest["author"]): string | undefined {
  const name = typeof author === "string" ? author : author?.name;

  return name?.replace(AUTHOR_CONTACT, "");
}

/**
 * Directories of the installed packages behind the build's modules.
 * @param {readonly string[]} moduleIds Ids of all modules of the build.
 * @returns {string[]} The package directories, sorted, each once.
 * @throws {Error} If no module belongs to a package: the packages were not recognized, and the
 *   notices would be empty without a word.
 */
export function packageDirectoriesOf(moduleIds: readonly string[]): string[] {
  const directories = new Set(moduleIds.flatMap((id) => packageDirectoryOf(id) ?? []));

  if (directories.size === 0) {
    throw new Error(`no third-party package found among ${moduleIds.length} modules`);
  }

  return [...directories].sort();
}

async function noticeFilesIn(directory: string): Promise<string[]> {
  const names = await readdir(directory);

  return names.filter((name) => NOTICE_FILE_NAME.test(name)).sort();
}

// The text is only as good as the check that the manifest still says what it was written from.
function unlicensedTextOf(manifest: PackageManifest, known: UnlicensedPackage): string {
  const isKnown =
    manifest.license === known.license && authorNameOf(manifest.author) === known.author;

  if (!isKnown) {
    throw new Error(
      `the license or author of ${manifest.name} ${manifest.version} changed: update its entry`,
    );
  }

  return mitLicenseText(known.author);
}

/**
 * The notice of one package: its name, version, license and the text of its license and notice
 * files (`LICENSE*`, `LICENCE*`, `NOTICE*`).
 * @param {string} directory Directory of the installed package.
 * @returns {Promise<string>} The notice.
 * @throws {Error} If the manifest is malformed, or the package has no license file and is not in
 *   the list of known exceptions, so that nothing is left out silently.
 */
export async function noticeOf(directory: string): Promise<string> {
  const raw: unknown = JSON.parse(await readFile(path.join(directory, "package.json"), "utf8"));
  const manifest = manifestOf(raw, directory);
  const files = await noticeFilesIn(directory);
  const heading = `${manifest.name} ${manifest.version} (${manifest.license})`;
  const known = PACKAGES_WITHOUT_LICENSE_FILE.get(manifest.name);

  if (files.length === 0 && known !== undefined) {
    return `${heading}\n\n${unlicensedTextOf(manifest, known)}\n`;
  }

  if (files.length === 0) {
    throw new Error(`the package ${manifest.name} has no license file: ${directory}`);
  }

  const texts = await Promise.all(
    files.map((file) => readFile(path.join(directory, file), "utf8")),
  );

  return `${heading}\n\n${texts.map((text) => text.trim()).join("\n\n")}\n`;
}

/**
 * Vite plugin that writes `THIRD_PARTY_LICENSES` into the build output: the notice of every package
 * in `node_modules` that the bundle reaches. The build fails on a package without a license file,
 * and when it reaches no package at all: that means the packages were not recognized.
 * @returns {Plugin} Plugin for the build.
 */
export function thirdPartyLicenses(): Plugin {
  return {
    name: "cyberzavod-third-party-licenses",
    async generateBundle() {
      const directories = packageDirectoriesOf([...this.getModuleIds()]);
      const notices = await Promise.all(directories.map(noticeOf));

      this.emitFile({
        type: "asset",
        fileName: LICENSES_FILE,
        source: notices.join(NOTICE_SEPARATOR),
      });
    },
  };
}
