import { describe, expect, it } from "vitest";
import {
  countedTokensOf,
  type SessionEvent,
  type SessionRecord,
  type TokenBreakdown,
} from "@cyberzavod/core";
import { costViewOf } from "./cost-view.ts";

const ONE_MILLION = 1_000_000;

function usage(t: number, model: string, patch: Partial<TokenBreakdown>): SessionEvent {
  const breakdown = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite5m: 0,
    cacheWrite1h: 0,
    ...patch,
  };
  const tokens = countedTokensOf(breakdown);

  return { t, type: "usage", tokens, model, breakdown };
}

function recordingWith(events: SessionEvent[]): SessionRecord {
  return {
    version: 1,
    type: "session",
    id: "2026-10-11-79fd668f",
    timestamp: "2026-10-11T21:39:18.968Z",
    projectId: "split-bill",
    source: { type: "agent", provider: "anthropic", agent: "claude" },
    data: {
      title: "Сборка",
      language: "ru",
      workflow: "default",
      harness: "0.0.0",
      events: [{ t: 0, type: "build_start" }, ...events, { t: 100, type: "build_end", ok: true }],
    },
  };
}

describe("costViewOf", () => {
  it("показывает итог и стоимость каждого этапа", () => {
    const recording = recordingWith([
      { t: 1, type: "stage_enter", stage: "planning" },
      usage(2, "claude-opus-5-5", { input: ONE_MILLION }),
      { t: 3, type: "stage_enter", stage: "implementation" },
      usage(4, "claude-sonnet-5-5", { output: ONE_MILLION }),
    ]);

    const view = costViewOf(recording, "en");

    expect(view?.items).toEqual([
      { label: "Total", value: "$14.00" },
      { label: "Plan", value: "$4.00" },
      { label: "Code", value: "$10.00" },
    ]);
  });

  it("показывает «До первого этапа», только если там есть расход", () => {
    const withBeforeStages = recordingWith([
      usage(1, "claude-opus-5-5", { input: ONE_MILLION }),
      { t: 2, type: "stage_enter", stage: "planning" },
      usage(3, "claude-opus-5-5", { input: ONE_MILLION }),
    ]);
    const withoutBeforeStages = recordingWith([
      { t: 2, type: "stage_enter", stage: "planning" },
      usage(3, "claude-opus-5-5", { input: ONE_MILLION }),
    ]);

    const labelsWith = costViewOf(withBeforeStages, "ru")?.items.map(({ label }) => label);
    const labelsWithout = costViewOf(withoutBeforeStages, "ru")?.items.map(({ label }) => label);

    expect(labelsWith).toEqual(["Итого", "До первого этапа", "Постановка"]);
    expect(labelsWithout).toEqual(["Итого", "Постановка"]);
  });

  it("делает итог суммой строк", () => {
    const recording = recordingWith([
      usage(1, "claude-opus-5-5", { input: ONE_MILLION }),
      { t: 2, type: "stage_enter", stage: "planning" },
      usage(3, "claude-opus-5-5", { output: ONE_MILLION }),
      { t: 4, type: "stage_enter", stage: "review" },
      usage(5, "claude-sonnet-5-5", { input: ONE_MILLION }),
    ]);

    const view = costViewOf(recording, "en");

    expect(view?.items.map(({ value }) => value)).toEqual(["$26.00", "$4.00", "$20.00", "$2.00"]);
  });

  it("называет дату цен в примечании", () => {
    const recording = recordingWith([
      { t: 1, type: "stage_enter", stage: "planning" },
      usage(2, "claude-opus-5-5", { input: ONE_MILLION }),
    ]);

    const view = costViewOf(recording, "ru");

    expect(view?.note).toBe("По ценам API на 21 октября 2026 г.; подписка оплачивается иначе.");
  });

  it("не показывает блок у записи без разбивки токенов", () => {
    const recording = recordingWith([
      { t: 1, type: "stage_enter", stage: "planning" },
      { t: 2, type: "usage", tokens: 500 },
    ]);

    const view = costViewOf(recording, "ru");

    expect(view).toBeUndefined();
  });

  it("не показывает блок, если у одного из расходов нет цены модели", () => {
    const recording = recordingWith([
      { t: 1, type: "stage_enter", stage: "planning" },
      usage(2, "gpt-6-astra", { input: ONE_MILLION }),
    ]);

    const view = costViewOf(recording, "ru");

    expect(view).toBeUndefined();
  });
});
