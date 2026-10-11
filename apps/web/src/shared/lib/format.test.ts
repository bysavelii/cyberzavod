import { describe, expect, it } from "vitest";
import {
  formatClock,
  formatCost,
  formatCount,
  formatDate,
  formatDuration,
  formatLanguage,
  formatModel,
  formatNumber,
  formatPercent,
  formatTokens,
  type PluralWords,
} from "./format.ts";

describe("formatDuration", () => {
  it.each([
    ["en", "42 s"],
    ["ru", "42 с"],
  ] as const)("показывает только секунды, если меньше минуты (%s)", (locale, expected) => {
    const result = formatDuration(42_400, locale);

    expect(result).toBe(expected);
  });

  it.each([
    ["en", "2 min 05 s"],
    ["ru", "2 мин 05 с"],
  ] as const)("дополняет секунды нулём, если есть минуты (%s)", (locale, expected) => {
    const result = formatDuration(125_000, locale);

    expect(result).toBe(expected);
  });

  it("округляет 59,6 с до целой минуты, а не до «60 с»", () => {
    const result = formatDuration(59_600, "ru");

    expect(result).toBe("1 мин 00 с");
  });

  it.each([
    ["en", "1 h 05 min"],
    ["ru", "1 ч 05 мин"],
  ] as const)("переходит на часы с минутами, если сборка дольше часа (%s)", (locale, expected) => {
    const result = formatDuration(3_900_000, locale);

    expect(result).toBe(expected);
  });
});

describe("formatClock", () => {
  it("показывает минуты и секунды в первый час", () => {
    const result = formatClock(125_400);

    expect(result).toBe("2:05");
  });

  it("округляет секунды так же, как счётчик времени: «17:22» рядом с «17 мин 22 с»", () => {
    const result = formatClock(1_041_800);

    expect(result).toBe("17:22");
  });

  it("добавляет часы после первого часа", () => {
    const result = formatClock(3_725_000);

    expect(result).toBe("1:02:05");
  });
});

describe("formatNumber", () => {
  it.each([
    ["en", "12,345"],
    ["ru", "12 345"],
  ] as const)("разбивает число по разрядам по правилам языка (%s)", (locale, expected) => {
    const result = formatNumber(12_345, locale);

    // Intl inserts non-breaking spaces, so we compare against regular ones.
    expect(result.replace(/\s/g, " ")).toBe(expected);
  });
});

describe("formatPercent", () => {
  it.each([
    ["en", "57%"],
    ["ru", "57 %"],
  ] as const)("пишет долю целым процентом по правилам языка (%s)", (locale, expected) => {
    const result = formatPercent(4 / 7, locale);

    // Intl inserts a non-breaking space in Russian, so we compare against a regular one.
    expect(result.replace(/\s/g, " ")).toBe(expected);
  });

  it("округляет до целого процента", () => {
    const result = formatPercent(0.666, "en");

    expect(result).toBe("67%");
  });

  it("пишет 0% и 100% на краях", () => {
    const results = [formatPercent(0, "en"), formatPercent(1, "en")];

    expect(results).toEqual(["0%", "100%"]);
  });
});

describe("formatTokens", () => {
  it.each([
    ["en", "1,234,567"],
    ["ru", "1 234 567"],
  ] as const)("разбивает число по разрядам по правилам языка (%s)", (locale, expected) => {
    const result = formatTokens(1_234_567, locale);

    // Intl inserts non-breaking spaces, so we compare against regular ones.
    expect(result.replace(/\s/g, " ")).toBe(expected);
  });
});

describe("formatDate", () => {
  it.each([
    ["en", "October 4, 2026"],
    ["ru", "4 октября 2026 г."],
  ] as const)("пишет день начала словами по UTC (%s)", (locale, expected) => {
    const result = formatDate("2026-10-04T23:30:00.000Z", locale);

    expect(result).toBe(expected);
  });
});

describe("formatModel", () => {
  it.each([
    ["claude-opus-5-5", "Claude Opus 5.5"],
    ["claude-haiku-4-5-20251001", "Claude Haiku 4.5"],
    ["claude-sonnet-4-20250514", "Claude Sonnet 4"],
    ["gpt-local", "gpt-local"],
  ])("называет «%s» как «%s»", (id, name) => {
    const result = formatModel(id);

    expect(result).toBe(name);
  });
});

describe("formatCount", () => {
  const prompts: PluralWords = {
    ru: { one: "промпт", few: "промпта", many: "промптов" },
    en: { one: "prompt", other: "prompts" },
  };

  it.each([
    [1, "1 промпт"],
    [3, "3 промпта"],
    [5, "5 промптов"],
    [11, "11 промптов"],
    [21, "21 промпт"],
    [0, "0 промптов"],
  ])("пишет %i со словом в нужной форме по-русски: %s", (count, expected) => {
    const result = formatCount(count, prompts, "ru");

    // Intl inserts non-breaking spaces, so we compare against regular ones.
    expect(result.replace(/\s/g, " ")).toBe(expected);
  });

  it.each([
    [1, "1 prompt"],
    [0, "0 prompts"],
    [2, "2 prompts"],
    [21, "21 prompts"],
    [1_000, "1,000 prompts"],
  ])("пишет %i со словом в нужной форме по-английски: %s", (count, expected) => {
    const result = formatCount(count, prompts, "en");

    expect(result).toBe(expected);
  });
});

describe("formatLanguage", () => {
  it.each([
    ["ru", "en", "Russian"],
    ["en", "ru", "английский"],
    ["ru", "ru", "русский"],
  ] as const)("называет язык %s на языке страницы %s", (code, locale, expected) => {
    const name = formatLanguage(code, locale);

    expect(name).toBe(expected);
  });

  it("показывает незнакомый код как есть", () => {
    const name = formatLanguage("qaa", "en");

    expect(name).toMatch(/qaa/i);
  });
});

describe("formatCost", () => {
  it.each([
    ["en", "$1.80"],
    ["ru", "1,80\u00a0$"],
  ] as const)("пишет доллары с двумя знаками после запятой (%s)", (locale, expected) => {
    const result = formatCost(1.8, locale);

    expect(result).toBe(expected);
  });

  it.each([
    ["en", "$1,234.57"],
    ["ru", "1\u00a0234,57\u00a0$"],
  ] as const)("группирует разряды (%s)", (locale, expected) => {
    const result = formatCost(1234.567, locale);

    expect(result).toBe(expected);
  });

  it.each([
    ["en", "< $0.01"],
    ["ru", "< 0,01\u00a0$"],
  ] as const)(
    "пишет «меньше цента», если сумма положительна, но меньше цента (%s)",
    (locale, expected) => {
      const result = formatCost(0.003, locale);

      expect(result).toBe(expected);
    },
  );

  it("пишет ноль как $0.00, а не «меньше цента»", () => {
    const result = formatCost(0, "en");

    expect(result).toBe("$0.00");
  });
});
