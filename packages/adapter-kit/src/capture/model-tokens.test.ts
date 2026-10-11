import { NO_BREAKDOWN, type TokenBreakdown } from "@cyberzavod/core";
import { describe, expect, it } from "vitest";
import { tokensByModel, usageEventsOf } from "./model-tokens.ts";

function breakdownOf(patch: Partial<TokenBreakdown>): TokenBreakdown {
  return { ...NO_BREAKDOWN, ...patch };
}

describe("tokensByModel", () => {
  it("суммирует разбивки одной модели по видам", () => {
    const messages = [
      { model: "claude-opus-5-5", breakdown: breakdownOf({ input: 1, cacheRead: 100 }) },
      { model: "claude-opus-5-5", breakdown: breakdownOf({ input: 2, output: 5 }) },
    ];

    const sums = tokensByModel(messages);

    expect(sums).toEqual([
      { model: "claude-opus-5-5", breakdown: breakdownOf({ input: 3, output: 5, cacheRead: 100 }) },
    ]);
  });

  it("держит модели по порядку появления, а сообщения без модели отдельной группой", () => {
    const messages = [
      { model: "b", breakdown: breakdownOf({ output: 1 }) },
      { breakdown: breakdownOf({ output: 2 }) },
      { model: "a", breakdown: breakdownOf({ output: 4 }) },
      { breakdown: breakdownOf({ output: 8 }) },
    ];

    const sums = tokensByModel(messages);

    expect(sums).toEqual([
      { model: "b", breakdown: breakdownOf({ output: 1 }) },
      { breakdown: breakdownOf({ output: 10 }) },
      { model: "a", breakdown: breakdownOf({ output: 4 }) },
    ]);
  });
});

describe("usageEventsOf", () => {
  it("делает usage на каждую модель со счётчиком без чтения кэша", () => {
    const tokens = [
      {
        model: "claude-opus-5-5",
        breakdown: breakdownOf({ input: 3, cacheRead: 100, cacheWrite1h: 4 }),
      },
      { breakdown: breakdownOf({ output: 2 }) },
    ];

    const events = usageEventsOf(tokens, 500);

    expect(events).toEqual([
      {
        t: 500,
        type: "usage",
        tokens: 7,
        model: "claude-opus-5-5",
        breakdown: breakdownOf({ input: 3, cacheRead: 100, cacheWrite1h: 4 }),
      },
      { t: 500, type: "usage", tokens: 2, breakdown: breakdownOf({ output: 2 }) },
    ]);
  });
});
