import { describe, expect, it } from "vitest";
import {
  add,
  formatMinorAsMajor,
  money,
  parseMajorToMinor,
  subtract,
  sum,
  zero,
} from "./money.ts";

describe("money", () => {
  it("accepts integer minor units and rejects fractional numbers", () => {
    expect(money(50000, "EUR").amountMinor).toBe(50000);
    expect(() => money(500.5, "EUR")).toThrow(/safe integer/);
    expect(() => money(Number.NaN, "EUR")).toThrow(/finite/);
  });

  it("rejects non-ISO currency codes", () => {
    expect(() => money(1, "euro")).toThrow(/ISO 4217/);
    expect(() => money(1, "EU")).toThrow(/ISO 4217/);
  });

  it("adds and subtracts in the same currency only", () => {
    const a = money(50000, "EUR");
    const b = money(15000, "EUR");
    expect(add(a, b)).toEqual(money(65000, "EUR"));
    expect(subtract(a, b)).toEqual(money(35000, "EUR"));
    expect(() => add(a, money(1, "GBP"))).toThrow(/Currency mismatch/);
  });

  it("allows negative totals so overspend is visible, not clamped", () => {
    expect(subtract(money(10, "EUR"), money(40, "EUR"))).toEqual(money(-30, "EUR"));
  });

  it("parses major-unit strings without floating point", () => {
    expect(parseMajorToMinor("500")).toBe(50000);
    expect(parseMajorToMinor("500.5")).toBe(50050);
    expect(parseMajorToMinor("500.50")).toBe(50050);
    expect(parseMajorToMinor("-12.34")).toBe(-1234);
    expect(() => parseMajorToMinor("500.501")).toThrow(/decimal places/);
    expect(() => parseMajorToMinor("1e2")).toThrow(/plain decimal/);
    expect(() => parseMajorToMinor("")).toThrow(/empty/);
  });

  it("formats minor units as fixed 2-decimal major strings", () => {
    expect(formatMinorAsMajor(50000)).toBe("500.00");
    expect(formatMinorAsMajor(5)).toBe("0.05");
    expect(formatMinorAsMajor(-1234)).toBe("-12.34");
  });

  it("sums a list in one currency", () => {
    expect(sum("EUR", [100, 200, 300])).toEqual(money(600, "EUR"));
    expect(zero("EUR")).toEqual(money(0, "EUR"));
  });
});
