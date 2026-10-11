// Reading API response fields. The response comes from the network: each field is checked before
// it enters the site's types, and a malformed response is an error with its location, not
// `undefined` in the markup.

import { ApiResponseError } from "./errors.ts";

/** A JSON object whose fields are not checked yet. */
export type JsonObject = Readonly<Record<string, unknown>>;

/**
 * Checks that the value is a JSON object.
 * @param {unknown} value Value from the response.
 * @param {string} place What this is, for the error message: `ответ /api/me`.
 * @returns {JsonObject} The same value as an object.
 * @throws {ApiResponseError} If it is not an object.
 */
export function objectAt(value: unknown, place: string): JsonObject {
  const isObject = typeof value === "object" && value !== null && !Array.isArray(value);

  if (!isObject) throw new ApiResponseError(`${place}: не объект`);

  return value as JsonObject;
}

/**
 * Reads a string field.
 * @param {JsonObject} object Object from the response.
 * @param {string} key Field name.
 * @param {string} place What this object is, for the error message.
 * @returns {string} Field value.
 * @throws {ApiResponseError} If the field is missing or not a string.
 */
export function stringAt(object: JsonObject, key: string, place: string): string {
  const value = object[key];

  if (typeof value !== "string") throw new ApiResponseError(`${place}: ${key} не строка`);

  return value;
}

/**
 * Reads a numeric field: a non-negative integer, a counter.
 * @param {JsonObject} object Object from the response.
 * @param {string} key Field name.
 * @param {string} place What this object is, for the error message.
 * @returns {number} Field value.
 * @throws {ApiResponseError} If the field is missing or not a non-negative integer.
 */
export function countAt(object: JsonObject, key: string, place: string): number {
  const value = object[key];
  const isCount = typeof value === "number" && Number.isInteger(value) && value >= 0;

  if (!isCount) throw new ApiResponseError(`${place}: ${key} не неотрицательное целое`);

  return value;
}

/**
 * Reads a boolean field.
 * @param {JsonObject} object Object from the response.
 * @param {string} key Field name.
 * @param {string} place What this object is, for the error message.
 * @returns {boolean} Field value.
 * @throws {ApiResponseError} If the field is missing or not `true`/`false`.
 */
export function booleanAt(object: JsonObject, key: string, place: string): boolean {
  const value = object[key];

  if (typeof value !== "boolean") throw new ApiResponseError(`${place}: ${key} не true/false`);

  return value;
}

/**
 * Reads an array field.
 * @param {JsonObject} object Object from the response.
 * @param {string} key Field name.
 * @param {string} place What this object is, for the error message.
 * @returns {readonly unknown[]} Array elements, not checked yet.
 * @throws {ApiResponseError} If the field is missing or not an array.
 */
export function arrayAt(object: JsonObject, key: string, place: string): readonly unknown[] {
  const value = object[key];

  if (!Array.isArray(value)) throw new ApiResponseError(`${place}: ${key} не массив`);

  return value as readonly unknown[];
}
