import { describe, expect, it } from "vitest";
import { API_PAGES, isUnindexedPath } from "./routes.ts";

describe("isUnindexedPath", () => {
  it("закрывает от поисковиков страницу записи из галереи", () => {
    const unindexed = isUnindexedPath(API_PAGES.sharedRecording);

    expect(unindexed).toBe(true);
  });

  it("закрывает от поисковиков личный кабинет", () => {
    const unindexed = isUnindexedPath(API_PAGES.cabinet);

    expect(unindexed).toBe(true);
  });

  it("закрывает от поисковиков страницу галерей", () => {
    const unindexed = isUnindexedPath(API_PAGES.galleries);

    expect(unindexed).toBe(true);
  });

  it.each(["/stats/", "/", "/recordings/a-1/"])("оставляет открытой страницу %s", (path) => {
    const unindexed = isUnindexedPath(path);

    expect(unindexed).toBe(false);
  });
});
