import { describe, expect, it } from "vitest";
import type { RecordingTotals, StageReworks } from "@/entities/recording";
import { projectTotalsOf } from "./totals-view.ts";

function projectTotals(): RecordingTotals {
  return {
    builds: 7,
    durationMs: 9_420_000,
    tokens: 2_526_012,
    prompts: 8,
    reworks: 3,
    buildsWithoutReworks: 4,
    buildsSucceeded: 7,
    interventions: 1,
  };
}

function stageReworks(): StageReworks[] {
  return [
    { stage: "review", count: 2 },
    { stage: "verification", count: 1 },
  ];
}

describe("projectTotalsOf", () => {
  it("показывает сборки, время всего и в среднем на сборку и токены", () => {
    const totals = projectTotals();

    const items = projectTotalsOf(totals, stageReworks(), "ru");

    expect(items.slice(0, 4)).toEqual([
      { label: "Сборки", value: "7" },
      { label: "Общее время", value: "2 ч 37 мин" },
      { label: "В среднем на сборку", value: "22 мин 26 с" },
      { label: "Токены всего", value: "2 526 012" },
    ]);
  });

  it("показывает долю сборок, прошедших с первого раза, и сколько это из скольких", () => {
    const totals = projectTotals();

    const items = projectTotalsOf(totals, stageReworks(), "ru");

    expect(items[4]).toEqual({ label: "С первого раза", value: "57\u00a0%", detail: "4 из 7" });
  });

  it("поясняет возвраты разбивкой по этапам", () => {
    const totals = projectTotals();

    const items = projectTotalsOf(totals, stageReworks(), "ru");

    expect(items[5]).toEqual({ label: "Возвраты", value: "3", detail: "Ревью 2 · Проверки 1" });
  });

  it("без возвратов не поясняет их", () => {
    const totals = { ...projectTotals(), reworks: 0, buildsWithoutReworks: 7 };

    const items = projectTotalsOf(totals, [], "en");

    expect(items[5]).toEqual({ label: "Reworks", value: "0" });
  });

  it("складывает участие человека из промптов и вмешательств", () => {
    const totals = projectTotals();

    const items = projectTotalsOf(totals, stageReworks(), "en");

    expect(items[6]).toEqual({
      label: "Human input",
      value: "9",
      detail: "8 prompts · 1 intervention",
    });
  });

  it("у проекта без сборок не делит на ноль", () => {
    const totals = { ...projectTotals(), builds: 0, durationMs: 0 };

    const items = projectTotalsOf(totals, stageReworks(), "en");

    expect(items[2]).toEqual({ label: "Per build on average", value: "0 s" });
  });

  it("у проекта без сборок доля с первого раза — ноль", () => {
    const totals = { ...projectTotals(), builds: 0, buildsWithoutReworks: 0 };

    const items = projectTotalsOf(totals, [], "en");

    expect(items[4]).toMatchObject({ value: "0%", detail: "0 of 0" });
  });
});
