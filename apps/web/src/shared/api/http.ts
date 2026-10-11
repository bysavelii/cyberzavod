import { ApiRequestError, ApiResponseError } from "./errors.ts";

/** An API request: `fetch` in the browser, a network-free stub in tests. */
export type ApiRequest = (path: string, init?: RequestInit) => Promise<Response>;

/** An API request that changes data: the method, the path and the body, if any. */
export interface ApiCommand {
  readonly method: "PUT" | "POST" | "DELETE";
  /** Path from the site root: `/api/me/gallery`. */
  readonly path: string;
  /** Request body: sent as JSON. */
  readonly body?: unknown;
}

/** Error code when an error response body is not JSON, for example a proxy page. */
const UNKNOWN_ERROR_CODE = "unknown";

// The sign-in cookie goes only to our own site: the API and the site share one address.
const browserRequest: ApiRequest = (path, init) =>
  fetch(path, { ...init, credentials: "same-origin" });

const JSON_HEADERS = { "Content-Type": "application/json" };

function errorCodeOf(body: unknown): string {
  const code =
    typeof body === "object" && body !== null && "error" in body ? body.error : undefined;

  return typeof code === "string" ? code : UNKNOWN_ERROR_CODE;
}

async function requestErrorOf(response: Response, path: string): Promise<ApiRequestError> {
  // An error response may come from the proxy in front of the API rather than the API itself;
  // then there is no JSON body and only the status remains.
  const body: unknown = await response.json().catch(() => undefined);

  return new ApiRequestError(
    response.status,
    errorCodeOf(body),
    `API ответил ${response.status} на ${path}`,
  );
}

/**
 * Reads an API response as JSON. Parsing it against the contract is up to the caller.
 * @param {string} path Path from the site root: `/api/me`.
 * @param {ApiRequest} [request] Request; the browser's `fetch` by default.
 * @returns {Promise<unknown>} Response body.
 * @throws {ApiRequestError} If the API responded with an error.
 * @throws {ApiResponseError} If the body of a successful response is not JSON.
 */
export async function getJson(
  path: string,
  request: ApiRequest = browserRequest,
): Promise<unknown> {
  const response = await request(path);

  if (!response.ok) throw await requestErrorOf(response, path);

  try {
    return (await response.json()) as unknown;
  } catch (err) {
    throw new ApiResponseError(`ответ ${path} — не JSON`, { cause: err });
  }
}

function requestInitOf(command: ApiCommand): RequestInit {
  if (command.body === undefined) return { method: command.method };

  return { method: command.method, headers: JSON_HEADERS, body: JSON.stringify(command.body) };
}

/**
 * Sends the API a request that changes data. The response is not read: after the change the page
 * asks the API again what came of it.
 * @param {ApiCommand} command Request method, path and body.
 * @param {ApiRequest} [request] Request; the browser's `fetch` by default.
 * @returns {Promise<void>} When the API responded with success.
 * @throws {ApiRequestError} If the API responded with an error.
 */
export async function sendCommand(
  command: ApiCommand,
  request: ApiRequest = browserRequest,
): Promise<void> {
  const response = await request(command.path, requestInitOf(command));

  if (!response.ok) throw await requestErrorOf(response, command.path);
}
