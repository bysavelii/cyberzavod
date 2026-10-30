// Machine-readable output of read and check commands (`--json`): one JSON document on stdout,
// without colors or translations. Keys are stable: scripts and CI read them, text for the human is
// not.

/** JSON output format version; not to be confused with the CLI and harness version. */
export const JSON_OUTPUT_SCHEMA_VERSION = 2;

/**
 * Prints a command's JSON document: format version, command name, then the command's fields.
 * @param {string} command Command name, for example `doctor`.
 * @param {object} body Document fields.
 */
export function printJson(command: string, body: object): void {
  const document = { schemaVersion: JSON_OUTPUT_SCHEMA_VERSION, command, ...body };

  console.log(JSON.stringify(document, null, 2));
}
