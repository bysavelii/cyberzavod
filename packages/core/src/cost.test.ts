import { describe, expect, it } from "vitest";
import { costOf, type Cost } from "./cost.ts";
import {
  countedTokensOf,
  type BriefSessionEvent,
  type BriefSessionRecord,
  type TokenBreakdown,
} from "./record.ts";
import type { Stage } from "./stage.ts";

const OPUS = "claude-opus-5-5";
const SONNET = "claude-sonnet-5-5";

function sessionWith(events: BriefSessionEvent[]): BriefSessionRecord {
  return {
    version: 1,
    type: "session",
    id: "2026-10-11-79fd668f",
    timestamp: "2026-10-11T21:39:18.968Z",
    projectId: "split-bill",
    source: { type: "agent", provider: "anthropic", agent: "claude" },
    data: { title: "Сборка", language: "ru", workflow: "default", harness: "0.0.0", events },
  };
}

function enter(stage: Stage, t: number): BriefSessionEvent {
  return { t, type: "stage_enter", stage };
}

function breakdown(patch: Partial<TokenBreakdown> = {}): TokenBreakdown {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite5m: 0, cacheWrite1h: 0, ...patch };
}

function usage(t: number, model: string | undefined, tokens: TokenBreakdown): BriefSessionEvent {
  const counted = countedTokensOf(tokens);

  return model === undefined
    ? { t, type: "usage", tokens: counted, breakdown: tokens }
    : { t, type: "usage", tokens: counted, model, breakdown: tokens };
}

// 1M input tokens of Opus 5.5 cost $4, 1M output tokens of Sonnet 5.5 cost $10.
const MILLION = 1_000_000;

function known(usd: number): Cost {
  return { kind: "known", usd };
}

describe("costOf", () => {
  it("считает каждый этап по цене модели его usage", () => {
    const session = sessionWith([
      enter("planning", 0),
      usage(1, OPUS, breakdown({ input: MILLION })),
      enter("implementation", 2),
      usage(3, SONNET, breakdown({ output: MILLION })),
    ]);

    const { stages } = costOf(session);

    expect(stages).toEqual([
      { stage: "planning", cost: known(4) },
      { stage: "implementation", cost: known(10) },
    ]);
  });

  it("считает все виды токенов по их ценам", () => {
    const session = sessionWith([
      enter("planning", 0),
      usage(
        1,
        OPUS,
        breakdown({
          input: MILLION,
          output: MILLION,
          cacheRead: MILLION,
          cacheWrite5m: MILLION,
          cacheWrite1h: MILLION,
        }),
      ),
    ]);

    const { total } = costOf(session);

    expect(total).toEqual(known(4 + 20 + 0.2 + 5 + 8));
  });

  it("делает итог суммой токенов до первого этапа и всех этапов", () => {
    const session = sessionWith([
      usage(1, OPUS, breakdown({ input: MILLION })),
      enter("planning", 2),
      usage(3, OPUS, breakdown({ output: MILLION })),
      enter("review", 4),
      usage(5, SONNET, breakdown({ output: MILLION })),
    ]);

    const cost = costOf(session);

    expect(cost.beforeStages).toEqual(known(4));
    expect(cost.total).toEqual(known(4 + 20 + 10));
  });

  it("ставит usage до первого этапа в отдельную часть", () => {
    const session = sessionWith([
      usage(1, OPUS, breakdown({ input: MILLION })),
      enter("planning", 2),
    ]);

    const cost = costOf(session);

    expect(cost.beforeStages).toEqual(known(4));
    expect(cost.stages).toEqual([{ stage: "planning", cost: known(0) }]);
  });

  it("суммирует в один этап работу, вернувшуюся на другую модель", () => {
    const session = sessionWith([
      enter("implementation", 0),
      usage(1, SONNET, breakdown({ output: MILLION })),
      enter("review", 2),
      enter("implementation", 3),
      usage(4, OPUS, breakdown({ output: MILLION })),
    ]);

    const { stages } = costOf(session);

    expect(stages).toEqual([
      { stage: "implementation", cost: known(30) },
      { stage: "review", cost: known(0) },
    ]);
  });

  it("отдаёт этапы в порядке процесса, а не входов", () => {
    const session = sessionWith([
      enter("review", 0),
      usage(1, OPUS, breakdown({ input: MILLION })),
      enter("planning", 2),
    ]);

    const names = costOf(session).stages.map(({ stage }) => stage);

    expect(names).toEqual(["planning", "review"]);
  });

  it("оценивает этап без usage в ноль долларов, пока в записи есть usage", () => {
    const session = sessionWith([
      enter("planning", 0),
      enter("review", 1),
      usage(2, OPUS, breakdown({ input: MILLION })),
    ]);

    const { stages } = costOf(session);

    expect(stages[0]).toEqual({ stage: "planning", cost: known(0) });
  });

  it("не знает стоимость записи без usage", () => {
    const session = sessionWith([enter("planning", 0)]);

    const { total } = costOf(session);

    expect(total).toEqual({ kind: "unknown", reason: { type: "no_usage" } });
  });

  it("не знает стоимость usage без разбивки", () => {
    const session = sessionWith([
      enter("planning", 0),
      { t: 1, type: "usage", tokens: 100, model: OPUS },
    ]);

    const { total } = costOf(session);

    expect(total).toEqual({ kind: "unknown", reason: { type: "no_breakdown" } });
  });

  it("не знает стоимость usage без модели", () => {
    const session = sessionWith([
      enter("planning", 0),
      usage(1, undefined, breakdown({ input: 100 })),
    ]);

    const { total } = costOf(session);

    expect(total).toEqual({ kind: "unknown", reason: { type: "no_model" } });
  });

  it("не знает стоимость модели вне таблицы цен и называет её", () => {
    const session = sessionWith([
      enter("planning", 0),
      usage(1, "gpt-6-astra", breakdown({ input: 100 })),
    ]);

    const { total } = costOf(session);

    expect(total).toEqual({
      kind: "unknown",
      reason: { type: "unpriced_model", model: "gpt-6-astra" },
    });
  });

  it("не делает известной стоимость этапа, если в нём есть usage без цены", () => {
    const session = sessionWith([
      enter("planning", 0),
      usage(1, OPUS, breakdown({ input: MILLION })),
      usage(2, "gpt-6-astra", breakdown({ input: 100 })),
    ]);

    const { stages } = costOf(session);

    expect(stages[0]?.cost.kind).toBe("unknown");
  });

  it("делает итог неизвестным, если неизвестна часть, но остальные части остаются известными", () => {
    const session = sessionWith([
      enter("planning", 0),
      usage(1, OPUS, breakdown({ input: MILLION })),
      enter("review", 2),
      usage(3, "gpt-6-astra", breakdown({ input: 100 })),
    ]);

    const cost = costOf(session);

    expect(cost.total.kind).toBe("unknown");
    expect(cost.stages[0]?.cost).toEqual(known(4));
  });

  it("находит цену модели со снимком по id без даты", () => {
    const session = sessionWith([
      enter("planning", 0),
      usage(1, "claude-sonnet-4-5-20250929", breakdown({ input: MILLION })),
    ]);

    const { total } = costOf(session);

    expect(total).toEqual(known(3));
  });
});
