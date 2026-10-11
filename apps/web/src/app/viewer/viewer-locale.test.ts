import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE } from "@/shared/i18n/locale.ts";
import { viewerLocaleOf } from "./viewer-locale.ts";

describe("viewerLocaleOf", () => {
  it.each([
    ["?lang=ru", "ru"],
    ["?lang=en", "en"],
    ["?x=1&lang=ru", "ru"],
  ] as const)("берёт язык из адреса %s", (search, expected) => {
    expect(viewerLocaleOf(search)).toBe(expected);
  });

  it.each([[""], ["?lang="], ["?lang=de"], ["?language=ru"]])(
    "берёт язык по умолчанию, когда в адресе %j нет известного языка",
    (search) => {
      expect(viewerLocaleOf(search)).toBe(DEFAULT_LOCALE);
    },
  );
});
