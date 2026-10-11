// The server of the factory floor: the files of the built factory floor and the list of
// recordings, on the loopback address only. Safe by construction: a request path is looked up in
// the table of files, never joined with a path on disk; the Host header must be the loopback
// address, so a page from another site cannot read the recordings through the human's browser.

import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { StaticFile } from "./static-files.ts";

/** What the server serves and how it reports failures. */
export interface ViewerServerOptions {
  files: ReadonlyMap<string, StaticFile>;
  /** The body of `GET /api/recordings`, read afresh for each request. */
  recordings(): Promise<unknown>;
  /** Called with the reason when a request fails; the browser only gets a 500. */
  onFailure(err: unknown): void;
}

/** A running server. */
export interface ViewerServer {
  /** Address of the server with a trailing "/". */
  url: string;
  close(): Promise<void>;
}

const LOOPBACK_ADDRESS = "127.0.0.1";
const LOCAL_NAMES: readonly string[] = [LOOPBACK_ADDRESS, "localhost"];
const RECORDINGS_PATH = "/api/recordings";
const ANY_FREE_PORT = 0;
const ALLOWED_METHODS = "GET, HEAD";
const GET_METHOD = "GET";
const HEAD_METHOD = "HEAD";
const JSON_CONTENT_TYPE = "application/json; charset=utf-8";
const FORBIDDEN = 403;
const NOT_FOUND = 404;
const METHOD_NOT_ALLOWED = 405;
const SERVER_ERROR = 500;
const OK = 200;
const QUERY_START = "?";

/**
 * Whether the Host header names this server by a loopback name and its port.
 * @param {string | undefined} host Value of the Host header.
 * @param {number | undefined} port Port the server listens on; undefined for a closed socket.
 * @returns {boolean} true for `127.0.0.1:<port>` and `localhost:<port>`.
 */
export function isLocalHost(host: string | undefined, port: number | undefined): boolean {
  return LOCAL_NAMES.some((name) => host === `${name}:${port}`);
}

function pathOf(request: IncomingMessage): string {
  return (request.url ?? "").split(QUERY_START)[0] ?? "";
}

function reply(response: ServerResponse, status: number, headers: Record<string, string> = {}) {
  response.writeHead(status, { "X-Content-Type-Options": "nosniff", ...headers });
}

function sendStatus(response: ServerResponse, status: number): void {
  reply(response, status);
  response.end();
}

function send(
  request: IncomingMessage,
  response: ServerResponse,
  body: string | Buffer,
  type: string,
) {
  reply(response, OK, { "Content-Type": type, "Cache-Control": "no-store" });
  response.end(request.method === HEAD_METHOD ? undefined : body);
}

async function sendFile(request: IncomingMessage, response: ServerResponse, file: StaticFile) {
  send(request, response, await readFile(file.file), file.contentType);
}

async function sendRecordings(
  request: IncomingMessage,
  response: ServerResponse,
  options: ViewerServerOptions,
) {
  send(request, response, JSON.stringify(await options.recordings()), JSON_CONTENT_TYPE);
}

async function answer(
  request: IncomingMessage,
  response: ServerResponse,
  options: ViewerServerOptions,
): Promise<void> {
  const requestedPath = pathOf(request);

  if (requestedPath === RECORDINGS_PATH) return sendRecordings(request, response, options);

  const file = options.files.get(requestedPath);

  if (file === undefined) return sendStatus(response, NOT_FOUND);

  return sendFile(request, response, file);
}

function isReadMethod(method: string | undefined): boolean {
  return method === GET_METHOD || method === HEAD_METHOD;
}

function serveRequest(options: ViewerServerOptions) {
  return (request: IncomingMessage, response: ServerResponse): void => {
    if (!isLocalHost(request.headers.host, request.socket.localPort)) {
      return sendStatus(response, FORBIDDEN);
    }

    if (!isReadMethod(request.method)) {
      reply(response, METHOD_NOT_ALLOWED, { Allow: ALLOWED_METHODS });
      response.end();

      return;
    }

    answer(request, response, options).catch((err: unknown) => {
      options.onFailure(err);
      sendStatus(response, SERVER_ERROR);
    });
  };
}

function listening(server: Server): Promise<AddressInfo> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(ANY_FREE_PORT, LOOPBACK_ADDRESS, () => resolve(server.address() as AddressInfo));
  });
}

function closing(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
    server.closeAllConnections();
  });
}

/**
 * Starts the server on a free port of the loopback address. Only `GET` and `HEAD` are answered:
 * the files of the table, and `/api/recordings`.
 * @param {ViewerServerOptions} options Files, the recordings source and the failure report.
 * @returns {Promise<ViewerServer>} The running server.
 */
export async function startViewerServer(options: ViewerServerOptions): Promise<ViewerServer> {
  const server = createServer(serveRequest(options));
  const { address, port } = await listening(server);

  return { url: `http://${address}:${port}/`, close: () => closing(server) };
}
