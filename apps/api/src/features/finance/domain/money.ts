export type Money = Readonly<{ amountMinor: bigint; currency: string }>;

export class LedgerValidationError extends Error {
  public readonly code = "LEDGER_VALIDATION_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "LedgerValidationError";
  }
}

export class LedgerStateError extends Error {
  public readonly code = "LEDGER_STATE_ERROR" as const;

  constructor(message: string) {
    super(message);
    this.name = "LedgerStateError";
  }
}

export class MoneyValidationError extends LedgerValidationError {
  constructor(message: string) {
    super(message);
    this.name = "MoneyValidationError";
  }
}

export function createMoney(amountMinor: bigint, currency: string): Money {
  if (typeof amountMinor !== "bigint" || amountMinor <= 0n)
    throw new MoneyValidationError("Money amount must be a positive bigint");
  if (typeof currency !== "string" || !/^[A-Za-z]{3}$/.test(currency))
    throw new MoneyValidationError("Currency must be a three-letter code");
  return Object.freeze({ amountMinor, currency: currency.toUpperCase() });
}
