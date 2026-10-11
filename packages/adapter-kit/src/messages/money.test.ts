import { describe, expect, it } from "vitest";
import { formatUsd } from "./money.ts";

describe("formatUsd", () => {
  it("печатает два знака после точки", () => {
    const result = formatUsd(1.8);

    expect(result).toBe("$1.80");
  });

  it("округляет до цента", () => {
    const result = formatUsd(0.126);

    expect(result).toBe("$0.13");
  });

  it("печатает меньше цента как «< $0.01»", () => {
    const result = formatUsd(0.003);

    expect(result).toBe("< $0.01");
  });

  it("печатает ноль как $0.00", () => {
    const result = formatUsd(0);

    expect(result).toBe("$0.00");
  });
});
