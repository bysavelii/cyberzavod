import { describe, expect, it } from "vitest";
import type { RecordSource, SessionEvent, SessionRecord, Stage } from "@cyberzavod/core";
import { comparisonColumnOf } from "./comparison-view.ts";

const CLAUDE_SOURCE: RecordSource = { type: "agent", provider: "anthropic", agent: "claude" };

function enter(stage: Stage, t: number, model?: string): SessionEvent {
  return model === undefined
    ? { t, type: "stage_enter", stage }
    : { t, type: "stage_enter", stage, model };
}

function recordingWith(
  events: readonly SessionEvent[] = [],
  source: RecordSource = CLAUDE_SOURCE,
): SessionRecord {
  return {
    version: 1,
    type: "session",
    id: "2026-10-07-79fd668f",
    timestamp: "2026-10-07T21:39:18.968Z",
    projectId: "split-bill",
    source,
    data: {
      title: "Разделить счёт",
      language: "ru",
      workflow: "default",
      harness: "0.9.1",
      task: "split-bill",
      events: [
        { t: 0, type: "build_start" },
        ...events,
        { t: 125_000, type: "build_end", ok: true },
      ],
    },
  };
}

function failedRecording(): SessionRecord {
  const recording = recordingWith();
  const eventsBeforeEnd = recording.data.events.slice(0, -1);
  const failedEnd: SessionEvent = { t: 125_000, type: "build_end", ok: false };

  return { ...recording, data: { ...recording.data, events: [...eventsBeforeEnd, failedEnd] } };
}

describe("comparisonColumnOf", () => {
  it("называет агента Claude Code по источнику записи", () => {
    const recording = recordingWith();

    const column = comparisonColumnOf(recording, "ru");

    expect(column.agent).toBe("Claude Code");
  });

  it("показывает незнакомого агента как есть", () => {
    const recording = recordingWith([], { type: "agent", provider: "acme", agent: "robo" });

    const column = comparisonColumnOf(recording, "ru");

    expect(column.agent).toBe("robo");
  });

  it("у записи, сделанной вручную, пишет «вручную»", () => {
    const recording = recordingWith([], { type: "manual" });

    const column = comparisonColumnOf(recording, "ru");

    expect(column.agent).toBe("вручную");
  });

  it("называет модели красивыми именами и соединяет их стрелкой", () => {
    const recording = recordingWith([
      enter("implementation", 10, "claude-sonnet-4-6"),
      enter("implementation", 20, "claude-opus-5-5"),
    ]);

    const column = comparisonColumnOf(recording, "en");

    expect(column.stages).toEqual([
      { label: "Code", models: "Claude Sonnet 4.6 → Claude Opus 5.5" },
    ]);
  });

  it("пишет, что модель неизвестна, если вход в этап её не назвал", () => {
    const recording = recordingWith([enter("review", 10)]);

    const column = comparisonColumnOf(recording, "ru");

    expect(column.stages).toEqual([{ label: "Ревью", models: "модель неизвестна" }]);
  });

  it("показывает процесс и версию harness записи", () => {
    const recording = recordingWith();

    const column = comparisonColumnOf(recording, "ru");

    expect(column.process).toBe("процесс default · harness 0.9.1");
  });

  it("даёт ссылку на запись, название и язык записи", () => {
    const recording = recordingWith();

    const column = comparisonColumnOf(recording, "ru");

    expect(column).toMatchObject({
      title: "Разделить счёт",
      language: "ru",
      url: "/ru/recordings/2026-10-07-79fd668f/",
    });
  });

  it("считает время, токены и итог записи", () => {
    const recording = recordingWith([{ t: 30, type: "usage", tokens: 500 }]);

    const column = comparisonColumnOf(recording, "en");

    expect(column.counters).toEqual([
      { label: "Time", value: "2 min 05 s" },
      { label: "Tokens", value: "500" },
      { label: "Cost", value: "unknown" },
      { label: "Reworks", value: "0" },
      { label: "Outcome", value: "checks passed" },
    ]);
  });

  it("показывает стоимость записи по ценам модели", () => {
    const recording = recordingWith([
      enter("planning", 10, "claude-opus-5-5"),
      {
        t: 30,
        type: "usage",
        tokens: 1_000_000,
        model: "claude-opus-5-5",
        breakdown: { input: 1_000_000, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0 },
      },
    ]);

    const column = comparisonColumnOf(recording, "en");

    expect(column.counters).toContainEqual({ label: "Cost", value: "$4.00" });
  });

  it("пишет «неизвестна», если стоимость записи не посчитать", () => {
    const recording = recordingWith([{ t: 30, type: "usage", tokens: 500 }]);

    const column = comparisonColumnOf(recording, "ru");

    expect(column.counters).toContainEqual({ label: "Стоимость", value: "неизвестна" });
  });

  it("пишет, что проверки не прошли, если сборка закончилась неудачей", () => {
    const recording = failedRecording();

    const column = comparisonColumnOf(recording, "ru");

    expect(column.counters.at(-1)).toEqual({ label: "Итог", value: "проверки не прошли" });
  });

  it("разбивает возвраты по этапам в пояснении", () => {
    const recording = recordingWith([
      { t: 10, type: "stage_fail", stage: "review", reason: "Этап вернул работу" },
      { t: 20, type: "stage_fail", stage: "review", reason: "Этап вернул работу" },
      { t: 30, type: "stage_fail", stage: "verification", reason: "Этап вернул работу" },
    ]);

    const column = comparisonColumnOf(recording, "ru");

    expect(column.counters[3]).toEqual({
      label: "Возвраты",
      value: "3",
      detail: "Ревью 2 · Проверки 1",
    });
  });
});
