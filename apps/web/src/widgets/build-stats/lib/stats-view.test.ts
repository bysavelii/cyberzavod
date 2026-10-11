import { describe, expect, it } from "vitest";
import type { InterventionReason, SessionEvent, SessionRecord, Stage } from "@cyberzavod/core";
import { statsViewOf } from "./stats-view.ts";

interface BuildSpec {
  readonly projectId: string;
  readonly tokens: number;
  readonly returnedBy: readonly Stage[];
  readonly calledFor: readonly InterventionReason[];
  readonly ok: boolean;
  /** Input tokens of Opus 5.5 ($4 per million) with a breakdown; without it the cost is unknown. */
  readonly pricedInput?: number;
}

function buildSpec(changes: Partial<BuildSpec> = {}): BuildSpec {
  return {
    projectId: "split-bill",
    tokens: 1_000,
    returnedBy: [],
    calledFor: [],
    ok: true,
    ...changes,
  };
}

function usageOf(spec: BuildSpec): SessionEvent {
  if (spec.pricedInput === undefined) return { t: 1, type: "usage", tokens: spec.tokens };

  const input = spec.pricedInput;
  const breakdown = { input, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 };

  return { t: 1, type: "usage", tokens: input, model: "claude-opus-5-5", breakdown };
}

function recordingOf(spec: BuildSpec): SessionRecord {
  const events: SessionEvent[] = [
    { t: 0, type: "build_start" },
    usageOf(spec),
    ...spec.returnedBy.map((stage): SessionEvent => {
      return { t: 2, type: "stage_fail", stage, reason: "Этап вернул работу" };
    }),
    ...spec.calledFor.map((reason): SessionEvent => {
      return { t: 3, type: "intervention", reason, line: "Да", text: "Да." };
    }),
    { t: 100, type: "build_end", ok: spec.ok },
  ];

  return {
    version: 1,
    type: "session",
    id: "2026-10-07-79fd668f",
    timestamp: "2026-10-07T21:39:18.968Z",
    projectId: spec.projectId,
    source: { type: "manual" },
    data: { title: "Сборка", language: "ru", workflow: "default", harness: "0.0.0", events },
  };
}

function filledRecordings(): SessionRecord[] {
  return [
    recordingOf(
      buildSpec({
        tokens: 2_000_000,
        returnedBy: ["verification", "review", "review"],
        calledFor: ["plan_review"],
      }),
    ),
    recordingOf(buildSpec({ projectId: "tip-calc", tokens: 500_000, ok: false })),
    recordingOf(buildSpec({ projectId: "tip-calc", tokens: 1_500_000 })),
  ];
}

describe("statsViewOf", () => {
  it("показывает заглушку, пока нет сборок", () => {
    const view = statsViewOf([], "ru");

    expect(view).toEqual({ kind: "empty" });
  });

  it("считает плашки: сборки, проекты, токены, с первого раза, возвраты и вмешательства", () => {
    const view = statsViewOf(filledRecordings(), "en");

    expect(view.kind === "filled" && view.totals).toEqual([
      { label: "Builds", value: "3" },
      { label: "Projects", value: "2" },
      { label: "Tokens", value: "4,000,000" },
      { label: "First try", value: "67%", detail: "2 of 3" },
      { label: "Reworks", value: "3" },
      { label: "Interventions", value: "1" },
    ]);
  });

  it("считает среднюю стоимость только по сборкам с известной стоимостью и говорит, по скольким", () => {
    const recordings = [
      recordingOf(buildSpec({ pricedInput: 1_000_000 })),
      recordingOf(buildSpec({ pricedInput: 3_000_000 })),
      recordingOf(buildSpec()),
    ];

    const view = statsViewOf(recordings, "en");

    expect(view.kind === "filled" && view.totals).toContainEqual({
      label: "Average build cost",
      value: "$8.00",
      detail: "over 2 of 3 builds",
    });
  });

  it("пишет пояснение к средней стоимости на языке страницы", () => {
    const recordings = [
      recordingOf(buildSpec({ pricedInput: 1_000_000 })),
      recordingOf(buildSpec()),
    ];

    const view = statsViewOf(recordings, "ru");

    expect(view.kind === "filled" && view.totals).toContainEqual({
      label: "Средняя стоимость сборки",
      value: "4,00\u00a0$",
      detail: "по 1 из 2 сборок",
    });
  });

  it.each([
    [1, 1, "en", "over 1 of 1 build"],
    [1, 21, "ru", "по 1 из 21 сборки"],
    [2, 22, "ru", "по 2 из 22 сборок"],
    [3, 5, "ru", "по 3 из 5 сборок"],
  ] as const)(
    "склоняет «сборки» в пояснении к средней стоимости: %i из %i (%s)",
    (withCost, builds, locale, expected) => {
      const priced = Array.from({ length: withCost }, () =>
        recordingOf(buildSpec({ pricedInput: 1_000_000 })),
      );
      const unpriced = Array.from({ length: builds - withCost }, () => recordingOf(buildSpec()));

      const view = statsViewOf([...priced, ...unpriced], locale);

      const averageCost = view.kind === "filled" ? view.totals.at(3) : undefined;

      expect(averageCost?.detail).toBe(expected);
    },
  );

  it("не показывает плашку средней стоимости, если ни у одной сборки нет известной стоимости", () => {
    const view = statsViewOf(filledRecordings(), "en");

    const labels = view.kind === "filled" ? view.totals.map(({ label }) => label) : [];

    expect(labels).not.toContain("Average build cost");
  });

  it("подписывает возвраты названиями этапов, частые сверху", () => {
    const view = statsViewOf(filledRecordings(), "ru");

    expect(view.kind === "filled" && view.returns).toEqual([
      { label: "Ревью", value: 2, valueText: "2" },
      { label: "Проверки", value: 1, valueText: "1" },
    ]);
  });

  it("подписывает вмешательства причинами", () => {
    const view = statsViewOf(filledRecordings(), "en");

    expect(view.kind === "filled" && view.interventions).toEqual([
      { label: "plan decision", value: 1, valueText: "1" },
    ]);
  });

  it("показывает исходы сборок", () => {
    const view = statsViewOf(filledRecordings(), "ru");

    expect(view.kind === "filled" && view.outcomes).toEqual([
      { label: "успешно", value: 2, valueText: "2" },
      { label: "с ошибкой", value: 1, valueText: "1" },
    ]);
  });

  it("не показывает возвраты и вмешательства, которых не было", () => {
    const view = statsViewOf([recordingOf(buildSpec())], "en");

    expect(view.kind === "filled" && [view.returns, view.interventions]).toEqual([[], []]);
  });
});
