import { describe, expect, it } from "vitest";
import { comparisonUrl, recordingUrl, statsUrl } from "./url.ts";

describe("recordingUrl", () => {
  it("оставляет адрес в корне для английского", () => {
    const url = recordingUrl("a-1", "en");

    expect(url).toBe("/recordings/a-1/");
  });

  it("добавляет префикс /ru для русского", () => {
    const url = recordingUrl("a-1", "ru");

    expect(url).toBe("/ru/recordings/a-1/");
  });
});

describe("comparisonUrl", () => {
  it("оставляет адрес в корне для английского", () => {
    const url = comparisonUrl("split-bill", "en");

    expect(url).toBe("/comparisons/split-bill/");
  });

  it("добавляет префикс /ru для русского", () => {
    const url = comparisonUrl("split-bill", "ru");

    expect(url).toBe("/ru/comparisons/split-bill/");
  });
});

describe("statsUrl", () => {
  it.each([
    ["en", "/stats/"],
    ["ru", "/ru/stats/"],
  ] as const)("ведёт на аналитику на языке %s", (locale, expected) => {
    const url = statsUrl(locale);

    expect(url).toBe(expected);
  });
});
