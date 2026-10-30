// `cyberzavod view`: the project's recordings and drafts on the factory floor in the browser. A
// local server on the loopback address; nothing in the project or the journal is written.

import type { InterfaceLanguage } from "@cyberzavod/core";
import { connectedAdaptersOf } from "../agents/host-agent.ts";
import type { Adapters } from "../agents/registry.ts";
import type { CommandError } from "../errors.ts";
import { HARNESS_VERSION } from "../installation/installation.ts";
import type { CliMessages } from "../messages/cli-messages.ts";
import type { Environment } from "../messages/language.ts";
import { localRecordingsOf } from "../viewer/recordings.ts";
import { startViewerServer, type ViewerServer } from "../viewer/server.ts";
import { staticFilesOf } from "../viewer/static-files.ts";
import type { LocateViewer } from "../viewer/locate-viewer.ts";
import { viewerSpecOf } from "../viewer/viewer-package.ts";
import { requireProjectAt } from "./project.ts";

// The factory floor page reads its interface language from this query parameter.
const LANGUAGE_QUERY_PARAMETER = "lang";

/** What `view` runs with; `locate` and `open` are stubbed in tests: no npx, no browser. */
export interface ViewOptions {
  messages: CliMessages;
  language: InterfaceLanguage;
  adapters: Adapters;
  env: Environment;
  /** Gets the directory of the built factory floor for a package spec. */
  locate: LocateViewer;
  /** Opens the address in the browser; false if it could not. */
  open(url: string): Promise<boolean>;
  /** Whether to open the browser; the address is printed either way. */
  isOpening: boolean;
}

// Not opening is no error: the address is already printed, the human can open it themselves.
async function openOrExplain(address: string, { open, messages }: ViewOptions): Promise<void> {
  if (await open(address)) return;

  console.log(messages.view.openFailed);
}

/**
 * Starts the factory floor for the project and prints its address.
 * @param {string} directory Directory inside the project.
 * @param {ViewOptions} options Messages, language, adapters, environment and the outside world.
 * @returns {Promise<ViewerServer>} The running server: the caller stops it.
 * @throws {CommandError} If the directory is not in a project or the factory floor package is
 *   not available.
 */
export async function startView(directory: string, options: ViewOptions): Promise<ViewerServer> {
  const { messages, language, adapters, env, locate, isOpening } = options;
  const project = await requireProjectAt(directory);
  const connected = connectedAdaptersOf(project.config, adapters);
  const spec = viewerSpecOf(env, HARNESS_VERSION);

  console.log(messages.view.preparing(spec));

  const files = await staticFilesOf(locate(spec, project.root));
  const server = await startViewerServer({
    files,
    recordings: () => localRecordingsOf(project, connected, language),
    onFailure: (err) => {
      const reason = err instanceof Error ? err.message : String(err);

      console.error(messages.view.requestFailed(reason));
    },
  });
  const address = `${server.url}?${LANGUAGE_QUERY_PARAMETER}=${language}`;

  console.log(messages.view.address(address));
  console.log(messages.view.stopHint);

  if (isOpening) await openOrExplain(address, options);

  return server;
}
