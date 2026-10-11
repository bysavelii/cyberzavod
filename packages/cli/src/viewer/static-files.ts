// The files of the factory floor the server may serve: a table built once from the directory, so a
// path from a request is looked up in it and never joined with a path on disk.

import { readdir } from "node:fs/promises";
import path from "node:path";

/** A file the server serves and the type it is served with. */
export interface StaticFile {
  /** Absolute path on disk. */
  file: string;
  contentType: string;
}

const URL_SEPARATOR = "/";
const INDEX_FILE = "index.html";
const UNKNOWN_CONTENT_TYPE = "application/octet-stream";
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

function contentTypeOf(file: string): string {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] ?? UNKNOWN_CONTENT_TYPE;
}

function urlPathOf(directory: string, file: string): string {
  const relative = path.relative(directory, file).split(path.sep).join(URL_SEPARATOR);

  return `${URL_SEPARATOR}${relative}`;
}

/**
 * Lists the files under the directory by the URL path they are served at. `/` is `index.html`
 * too.
 * @param {string} directory Directory of the built factory floor.
 * @returns {Promise<ReadonlyMap<string, StaticFile>>} URL path (with `/` separators) to the file.
 */
export async function staticFilesOf(directory: string): Promise<ReadonlyMap<string, StaticFile>> {
  const entries = await readdir(directory, { recursive: true, withFileTypes: true });
  const files = new Map<string, StaticFile>();

  for (const entry of entries.filter((candidate) => candidate.isFile())) {
    const file = path.join(entry.parentPath, entry.name);

    files.set(urlPathOf(directory, file), { file, contentType: contentTypeOf(file) });
  }

  const index = files.get(`${URL_SEPARATOR}${INDEX_FILE}`);

  if (index !== undefined) files.set(URL_SEPARATOR, index);

  return files;
}
