/**
 * Money is always integer minor units (e.g. euro cents).
 * Never use floating-point numbers as financial values.
 *
 * V1 assumption: every household currency uses two decimal places
 * (EUR, USD, GBP, …). Zero-decimal currencies are out of scope until
 * an exponent table is added deliberately.
 */

export const MINOR_EXPONENT = 2;
export const MINOR_FACTOR = 10 ** MINOR_EXPONENT;

/** ISO 4217 alphabetic code. V1: one currency per household. */
export type CurrencyCode = string;

/** Integer minor units. Must be a safe integer — never a fractional number. */
export type MinorUnits = number;

export type Money = {
  amountMinor: MinorUnits;
  currency: CurrencyCode;
};

export class MoneyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MoneyError";
  }
}

export function assertMinorUnits(value: number): MinorUnits {
  if (typeof value !== "number" || Number.isNaN(value) || !Number.isFinite(value)) {
    throw new MoneyError("Money amount must be a finite number");
  }
  if (!Number.isSafeInteger(value)) {
    throw new MoneyError("Money amount must be a safe integer in minor units");
  }
  return value;
}

export function assertCurrencyCode(code: string): CurrencyCode {
  if (!/^[A-Z]{3}$/.test(code)) {
    throw new MoneyError("Currency must be a 3-letter ISO 4217 code (e.g. EUR)");
  }
  return code;
}

export function money(amountMinor: number, currency: string): Money {
  return {
    amountMinor: assertMinorUnits(amountMinor),
    currency: assertCurrencyCode(currency),
  };
}

export function zero(currency: string): Money {
  return money(0, currency);
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function sum(currency: string, amounts: readonly MinorUnits[]): Money {
  const code = assertCurrencyCode(currency);
  let total = 0;
  for (const amount of amounts) {
    total += assertMinorUnits(amount);
  }
  return money(total, code);
}

/**
 * Parse a major-unit string such as "500", "500.5", or "500.50" into minor units.
 * Rejects numbers (floats), scientific notation, and extra fraction digits.
 */
export function parseMajorToMinor(input: string): MinorUnits {
  const trimmed = input.trim();
  if (trimmed === "" || trimmed === "-" || trimmed === "+" || trimmed === ".") {
    throw new MoneyError("Money string is empty or incomplete");
  }
  if (!/^[+-]?\d+(\.\d+)?$/.test(trimmed)) {
    throw new MoneyError("Money string must be a plain decimal (e.g. 500.50)");
  }
  const negative = trimmed.startsWith("-");
  const unsigned = trimmed.replace(/^[+-]/, "");
  const [wholeRaw, fractionRaw] = unsigned.split(".");
  const whole = wholeRaw ?? "0";
  const fraction = fractionRaw ?? "";
  if (fraction.length > MINOR_EXPONENT) {
    throw new MoneyError(`Money string cannot have more than ${MINOR_EXPONENT} decimal places`);
  }
  const paddedFraction = fraction.padEnd(MINOR_EXPONENT, "0");
  const minor = Number.parseInt(whole, 10) * MINOR_FACTOR + Number.parseInt(paddedFraction || "0", 10);
  const signed = negative ? -minor : minor;
  return assertMinorUnits(signed);
}

/** Format minor units as a major-unit string with a fixed exponent (not locale-aware). */
export function formatMinorAsMajor(amountMinor: MinorUnits): string {
  const value = assertMinorUnits(amountMinor);
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const whole = Math.trunc(abs / MINOR_FACTOR);
  const fraction = String(abs % MINOR_FACTOR).padStart(MINOR_EXPONENT, "0");
  return `${sign}${whole}.${fraction}`;
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}
