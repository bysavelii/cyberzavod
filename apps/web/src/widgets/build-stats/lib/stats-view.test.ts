import { describe, expect, it } from "vitest";
import type { InterventionReason, SessionEvent, SessionRecord, Stage } from "@cyberzavod/core";
import { statsViewOf } from "./stats-view.ts";

interface BuildSpec {
  readonly projectId: string;
  readonly tokens: number;
  readonly returnedBy: readonly Stage[];
  readonly calledFor: readonly InterventionReason[];
  readonly ok: boolean;
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

function recordingOf(spec: BuildSpec): SessionRecord {
  const events: SessionEvent[] = [
    { t: 0, type: "build_start" },
    { t: 1, type: "usage", tokens: spec.tokens },
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
