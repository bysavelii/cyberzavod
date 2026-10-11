import { describe, expect, it } from "vitest";
import type { SessionEvent, SessionRecord } from "@cyberzavod/core";
import { averagePerBuild, humanInputOf, totalsOf, type RecordingTotals } from "./totals.ts";

interface BuildCounts {
  readonly durationMs: number;
  readonly tokens: number;
  readonly prompts: number;
  readonly reworks: number;
  readonly interventions: number;
}

function eventsOf(counts: BuildCounts): SessionEvent[] {
  const prompts = Array.from({ length: counts.prompts }, () => ({
    t: 1,
    type: "prompt" as const,
    goal: "Сделай задачу",
    requirements: [],
  }));
  const reworks = Array.from({ length: counts.reworks }, () => ({
    t: 2,
    type: "stage_fail" as const,
    stage: "review" as const,
    reason: "Нужна правка",
  }));
  const interventions = Array.from({ length: counts.interventions }, () => ({
    t: 3,
    type: "intervention" as const,
    reason: "plan_review" as const,
    line: "Одобряю",
    text: "Одобряю постановку.",
  }));

  return [
    { t: 0, type: "build_start" },
    ...prompts,
    ...reworks,
    ...interventions,
    { t: 4, type: "usage", tokens: counts.tokens },
    { t: counts.durationMs, type: "build_end", ok: true },
  ];
}

function recordingWith(counts: BuildCounts): SessionRecord {
  return {
    version: 1,
    type: "session",
    id: "2026-10-07-79fd668f",
    timestamp: "2026-10-07T21:39:18.968Z",
    projectId: "split-bill",
    source: { type: "manual" },
    data: {
      title: "Сборка",
      language: "ru",
      workflow: "default",
      harness: "0.0.0",
      events: eventsOf(counts),
    },
  };
}

function failedRecording(recording: SessionRecord): SessionRecord {
  const events = recording.data.events.map((event): SessionEvent => {
    return event.type === "build_end" ? { ...event, ok: false } : event;
  });

  return { ...recording, data: { ...recording.data, events } };
}

function quietBuild(): BuildCounts {
  return { durationMs: 60_000, tokens: 1_000, prompts: 1, reworks: 0, interventions: 0 };
}

function busyBuild(): BuildCounts {
  return { durationMs: 120_000, tokens: 3_000, prompts: 2, reworks: 2, interventions: 1 };
}

function totalsWith(changes: Partial<RecordingTotals>): RecordingTotals {
  return {
    builds: 4,
    durationMs: 100_000,
    tokens: 10_000,
    prompts: 6,
    reworks: 3,
    buildsWithoutReworks: 2,
    buildsSucceeded: 3,
    interventions: 1,
    ...changes,
  };
}

describe("totalsOf", () => {
  it("складывает время, токены, промпты, возвраты и вмешательства сборок", () => {
    const recordings = [recordingWith(quietBuild()), recordingWith(busyBuild())];

    const totals = totalsOf(recordings);

    expect(totals).toEqual({
      builds: 2,
      durationMs: 180_000,
      tokens: 4_000,
      prompts: 3,
      reworks: 2,
      buildsWithoutReworks: 1,
      buildsSucceeded: 2,
      interventions: 1,
    });
  });

  it("считает успешными только сборки, закончившиеся успехом", () => {
    const busyRecording = recordingWith(busyBuild());
    const failedBuild = failedRecording(busyRecording);
    const recordings = [recordingWith(quietBuild()), failedBuild];

    const totals = totalsOf(recordings);

    expect([totals.builds, totals.buildsSucceeded]).toEqual([2, 1]);
  });

  it("считает сборки без возвратов отдельно от числа возвратов", () => {
    const recordings = [
      recordingWith(quietBuild()),
      recordingWith(quietBuild()),
      recordingWith(busyBuild()),
    ];

    const totals = totalsOf(recordings);

    expect([totals.buildsWithoutReworks, totals.reworks]).toEqual([2, 2]);
  });

  it("у пустого списка все счётчики нулевые", () => {
    const totals = totalsOf([]);

    expect(Object.values(totals).every((count) => count === 0)).toBe(true);
  });
});

describe("averagePerBuild", () => {
  it("делит счётчик на число сборок без округления", () => {
    const totals = totalsWith({ builds: 3, reworks: 2 });

    const average = averagePerBuild(totals, "reworks");

    expect(average).toBeCloseTo(0.6667, 4);
  });

  it("у итогов без сборок даёт 0, а не деление на ноль", () => {
    const totals = totalsWith({ builds: 0, durationMs: 0 });

    const average = averagePerBuild(totals, "durationMs");

    expect(average).toBe(0);
  });
});

describe("humanInputOf", () => {
  it("складывает промпты и вмешательства человека", () => {
    const totals = totalsWith({ prompts: 6, interventions: 1 });

    const humanInput = humanInputOf(totals);

    expect(humanInput).toBe(7);
  });
});
