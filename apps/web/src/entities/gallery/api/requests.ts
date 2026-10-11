import { ApiRequestError } from "@/shared/api/errors.ts";
import { getJson, sendCommand, type ApiRequest } from "@/shared/api/http.ts";
import type { Gallery, OwnGallery, SharedRecording } from "../model/gallery.ts";
import { parseGallery, parseOwnGallery, parseSharedRecording } from "../model/parse.ts";

const UNAUTHORIZED_STATUS = 401;

function isUnauthorized(err: unknown): boolean {
  return err instanceof ApiRequestError && err.status === UNAUTHORIZED_STATUS;
}

/**
 * Requests an author's public gallery.
 * @param {string} login Author's GitHub login.
 * @param {ApiRequest} [request] Request; the browser `fetch` by default.
 * @returns {Promise<Gallery>} The gallery; a private or nonexistent one is a 404 error.
 */
export async function fetchGallery(login: string, request?: ApiRequest): Promise<Gallery> {
  const body = await getJson(`/api/galleries/${encodeURIComponent(login)}`, request);

  return parseGallery(body);
}

/**
 * Requests a recording by secret link.
 * @param {string} slug The secret part of the link.
 * @param {ApiRequest} [request] Request; the browser `fetch` by default.
 * @returns {Promise<SharedRecording>} A recording that passed the core's check.
 */
export async function fetchSharedRecording(
  slug: string,
  request?: ApiRequest,
): Promise<SharedRecording> {
  const body = await getJson(`/api/recordings/${encodeURIComponent(slug)}`, request);

  return parseSharedRecording(body);
}

/**
 * Requests the signed-in author's own gallery: sign-in is by the site cookie.
 * @param {ApiRequest} [request] Request; the browser `fetch` by default.
 * @returns {Promise<OwnGallery | undefined>} The gallery, or `undefined` if nobody signed in (401).
 * @throws {ApiRequestError} If the API responded with another error; a wrong-shape response is
 *   `ApiResponseError`.
 */
export async function fetchOwnGallery(request?: ApiRequest): Promise<OwnGallery | undefined> {
  try {
    const body = await getJson("/api/me", request);

    return parseOwnGallery(body);
  } catch (err) {
    if (isUnauthorized(err)) return undefined;

    throw err;
  }
}

/**
 * Makes one's own gallery public or private.
 * @param {boolean} isPublic Whether to make the gallery public.
 * @param {ApiRequest} [request] Request; the browser `fetch` by default.
 * @returns {Promise<void>} When the API has accepted the change.
 */
export function setGalleryPublic(isPublic: boolean, request?: ApiRequest): Promise<void> {
  return sendCommand(
    { method: "PUT", path: "/api/me/gallery", body: { public: isPublic } },
    request,
  );
}

/**
 * Removes a recording from one's own gallery; its link stops working.
 * @param {string} id Recording id, the file name in the author's journal.
 * @param {ApiRequest} [request] Request; the browser `fetch` by default.
 * @returns {Promise<void>} When the API has removed the recording.
 */
export function deleteOwnRecording(id: string, request?: ApiRequest): Promise<void> {
  const path = `/api/me/recordings/${encodeURIComponent(id)}`;

  return sendCommand({ method: "DELETE", path }, request);
}
