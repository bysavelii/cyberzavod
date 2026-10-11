import { describe, expect, it } from "vitest";
import type { InterventionReason, SessionEvent, SessionRecord } from "@cyberzavod/core";
import { interventionsByReasonOf } from "./interventions.ts";

function recordingCalledFor(reasons: readonly InterventionReason[]): SessionRecord {
  const events: SessionEvent[] = [
    { t: 0, type: "build_start" },
    ...reasons.map((reason, index): SessionEvent => {
      return { t: index + 1, type: "intervention", reason, line: "Да", text: "Да." };
    }),
    { t: 100, type: "build_end", ok: true },
  ];

  return {
    version: 1,
    type: "session",
    id: "2026-10-07-79fd668f",
    timestamp: "2026-10-07T21:39:18.968Z",
    projectId: "split-bill",
    source: { type: "manual" },
    data: { title: "Сборка", language: "ru", workflow: "default", harness: "0.0.0", events },
  };
}

describe("interventionsByReasonOf", () => {
  it("суммирует вмешательства причины по всем сборкам", () => {
    const recordings = [
      recordingCalledFor(["plan_review", "plan_review"]),
      recordingCalledFor(["plan_review", "question"]),
    ];

    const interventions = interventionsByReasonOf(recordings);

    expect(interventions).toEqual([
      { reason: "question", count: 1 },
      { reason: "plan_review", count: 3 },
    ]);
  });

  it("отдаёт причины в порядке INTERVENTION_REASONS, а не в порядке вмешательств", () => {
    const recordings = [recordingCalledFor(["stop_gate", "question", "rework_limit"])];

    const reasons = interventionsByReasonOf(recordings).map(({ reason }) => reason);

    expect(reasons).toEqual(["question", "rework_limit", "stop_gate"]);
  });

  it("не показывает причины без вмешательств", () => {
    const recordings = [recordingCalledFor([]), recordingCalledFor(["question"])];

    const interventions = interventionsByReasonOf(recordings);

    expect(interventions).toEqual([{ reason: "question", count: 1 }]);
  });

  it("у пустого списка записей вмешательств нет", () => {
    const interventions = interventionsByReasonOf([]);

    expect(interventions).toEqual([]);
  });
});
