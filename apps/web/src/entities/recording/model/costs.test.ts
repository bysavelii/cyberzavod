import { describe, expect, it } from "vitest";
import type { SessionEvent, SessionRecord } from "@cyberzavod/core";
import { averageCostOf, costOfRecording, costTotalsOf } from "./costs.ts";

const ONE_MILLION = 1_000_000;

// A build whose single stage spent `input` input tokens of Opus 5.5, $4 per million.
function pricedRecording(input: number): SessionRecord {
  return recordingWith([
    { t: 1, type: "stage_enter", stage: "planning" },
    {
      t: 2,
      type: "usage",
      tokens: input,
      model: "claude-opus-5-5",
      breakdown: { input, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 },
    },
  ]);
}

function unpricedRecording(): SessionRecord {
  return recordingWith([{ t: 2, type: "usage", tokens: 500 }]);
}

function recordingWith(events: SessionEvent[]): SessionRecord {
  return {
    version: 1,
    type: "session",
    id: "2026-10-11-79fd668f",
    timestamp: "2026-10-11T21:39:18.968Z",
    projectId: "split-bill",
    source: { type: "manual" },
    data: {
      title: "Сборка",
      language: "ru",
      workflow: "default",
      harness: "0.0.0",
      events: [{ t: 0, type: "build_start" }, ...events, { t: 100, type: "build_end", ok: true }],
    },
  };
}

describe("costOfRecording", () => {
  it("отдаёт стоимость записи в долларах", () => {
    const cost = costOfRecording(pricedRecording(ONE_MILLION));

    expect(cost).toBe(4);
  });

  it("не отдаёт стоимость записи без разбивки токенов", () => {
    const cost = costOfRecording(unpricedRecording());

    expect(cost).toBeUndefined();
  });
});

describe("costTotalsOf", () => {
  it("складывает только известные стоимости и считает все сборки", () => {
    const recordings = [
      pricedRecording(ONE_MILLION),
      unpricedRecording(),
      pricedRecording(ONE_MILLION * 2),
    ];

    const totals = costTotalsOf(recordings);

    expect(totals).toEqual({ builds: 3, buildsWithCost: 2, usd: 12 });
  });

  it("для пустого списка отдаёт нули", () => {
    const totals = costTotalsOf([]);

    expect(totals).toEqual({ builds: 0, buildsWithCost: 0, usd: 0 });
  });
});

describe("averageCostOf", () => {
  it("делит сумму на число сборок с известной стоимостью, а не на все сборки", () => {
    const totals = costTotalsOf([
      pricedRecording(ONE_MILLION),
      unpricedRecording(),
      pricedRecording(ONE_MILLION * 3),
    ]);

    const average = averageCostOf(totals);

    expect(average).toBe(8);
  });

  it("не отдаёт среднее, если ни у одной сборки нет известной стоимости", () => {
    const totals = costTotalsOf([unpricedRecording()]);

    const average = averageCostOf(totals);

    expect(average).toBeUndefined();
  });
});
