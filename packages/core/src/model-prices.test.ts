import { describe, expect, it } from "vitest";
import { priceOf } from "./model-prices.ts";

describe("priceOf", () => {
  it("находит цену по точному id", () => {
    const price = priceOf("claude-opus-5-5");

    expect(price).toEqual({
      input: 4,
      output: 20,
      cacheRead: 0.2,
      cacheWrite5m: 5,
      cacheWrite1h: 8,
    });
  });

  it("находит цену id со снимком по id без суффикса даты", () => {
    const price = priceOf("claude-sonnet-4-5-20250929");

    expect(price).toEqual(priceOf("claude-sonnet-4-5"));
    expect(price).toBeDefined();
  });

  it("не находит цену модели вне таблицы", () => {
    const price = priceOf("gpt-6-astra");

    expect(price).toBeUndefined();
  });

  it("не принимает за модель свойство объекта", () => {
    const price = priceOf("constructor");

    expect(price).toBeUndefined();
  });

  it("не отрезает от id суффикс, который не дата снимка", () => {
    const price = priceOf("claude-opus-5-5-fast");

    expect(price).toBeUndefined();
  });
});
