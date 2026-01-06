import { describe, it, expect } from 'vitest';
import {
  canPayCost,
  deductSymbols,
  getCounterBidCost,
  getFinalBidCost,
  validatePayment,
  createAutoPayment,
} from '../../src/game/payment';
import type { SymbolPool, SymbolCost } from '../../src/game/types';

describe('canPayCost', () => {
  it('should allow exact payment', () => {
    const available: SymbolPool = { mars: 2, venus: 1, mercury: 0, moon: 0 };
    const required: SymbolCost = { mars: 2, venus: 1, mercury: 0, moon: 0, any: 0 };
    expect(canPayCost(available, required)).toBe(true);
  });

  it('should allow payment with surplus', () => {
    const available: SymbolPool = { mars: 3, venus: 2, mercury: 1, moon: 1 };
    const required: SymbolCost = { mars: 1, venus: 1, mercury: 0, moon: 0, any: 0 };
    expect(canPayCost(available, required)).toBe(true);
  });

  it('should reject insufficient specific symbols', () => {
    const available: SymbolPool = { mars: 1, venus: 0, mercury: 0, moon: 0 };
    const required: SymbolCost = { mars: 2, venus: 0, mercury: 0, moon: 0, any: 0 };
    expect(canPayCost(available, required)).toBe(false);
  });

  it('should allow "any" payment with any symbol type', () => {
    const available: SymbolPool = { mars: 3, venus: 0, mercury: 0, moon: 0 };
    const required: SymbolCost = { mars: 1, venus: 0, mercury: 0, moon: 0, any: 1 };
    expect(canPayCost(available, required)).toBe(true);
  });

  it('should allow "any" payment with mixed symbols', () => {
    const available: SymbolPool = { mars: 2, venus: 1, mercury: 0, moon: 0 };
    const required: SymbolCost = { mars: 1, venus: 0, mercury: 0, moon: 0, any: 2 };
    expect(canPayCost(available, required)).toBe(true);
  });

  it('should allow all "any" symbols with any combination', () => {
    const available: SymbolPool = { mars: 1, venus: 1, mercury: 1, moon: 1 };
    const required: SymbolCost = { mars: 0, venus: 0, mercury: 0, moon: 0, any: 4 };
    expect(canPayCost(available, required)).toBe(true);
  });

  it('should reject insufficient total for "any"', () => {
    const available: SymbolPool = { mars: 2, venus: 1, mercury: 0, moon: 0 };
    const required: SymbolCost = { mars: 1, venus: 1, mercury: 0, moon: 0, any: 2 };
    expect(canPayCost(available, required)).toBe(false);
  });

  it('should allow free cards (all zeros)', () => {
    const available: SymbolPool = { mars: 0, venus: 0, mercury: 0, moon: 0 };
    const required: SymbolCost = { mars: 0, venus: 0, mercury: 0, moon: 0, any: 0 };
    expect(canPayCost(available, required)).toBe(true);
  });
});

describe('deductSymbols', () => {
  it('should deduct symbols correctly', () => {
    const pool: SymbolPool = { mars: 4, venus: 3, mercury: 2, moon: 1 };
    const payment: SymbolPool = { mars: 2, venus: 1, mercury: 0, moon: 0 };
    const result = deductSymbols(pool, payment);

    expect(result).toEqual({
      mars: 2,
      venus: 2,
      mercury: 2,
      moon: 1,
    });
  });

  it('should handle zero deductions', () => {
    const pool: SymbolPool = { mars: 4, venus: 3, mercury: 2, moon: 1 };
    const payment: SymbolPool = { mars: 0, venus: 0, mercury: 0, moon: 0 };
    const result = deductSymbols(pool, payment);

    expect(result).toEqual(pool);
  });
});

describe('getCounterBidCost', () => {
  it('should add 1 to any cost', () => {
    const original: SymbolCost = { mars: 2, venus: 1, mercury: 0, moon: 0, any: 0 };
    const counter = getCounterBidCost(original);

    expect(counter).toEqual({
      mars: 2,
      venus: 1,
      mercury: 0,
      moon: 0,
      any: 1,
    });
  });

  it('should stack with existing any cost', () => {
    const original: SymbolCost = { mars: 1, venus: 1, mercury: 0, moon: 0, any: 1 };
    const counter = getCounterBidCost(original);

    expect(counter).toEqual({
      mars: 1,
      venus: 1,
      mercury: 0,
      moon: 0,
      any: 2,
    });
  });
});

describe('getFinalBidCost', () => {
  it('should add 2 to any cost', () => {
    const original: SymbolCost = { mars: 2, venus: 1, mercury: 0, moon: 0, any: 0 };
    const final = getFinalBidCost(original);

    expect(final).toEqual({
      mars: 2,
      venus: 1,
      mercury: 0,
      moon: 0,
      any: 2,
    });
  });

  it('should stack with existing any cost', () => {
    const original: SymbolCost = { mars: 1, venus: 1, mercury: 0, moon: 0, any: 1 };
    const final = getFinalBidCost(original);

    expect(final).toEqual({
      mars: 1,
      venus: 1,
      mercury: 0,
      moon: 0,
      any: 3,
    });
  });
});

describe('validatePayment', () => {
  it('should validate correct payment', () => {
    const payment: SymbolPool = { mars: 2, venus: 1, mercury: 0, moon: 0 };
    const available: SymbolPool = { mars: 4, venus: 3, mercury: 2, moon: 1 };
    const required: SymbolCost = { mars: 2, venus: 1, mercury: 0, moon: 0, any: 0 };

    expect(validatePayment(payment, available, required)).toBe(true);
  });

  it('should validate payment with "any" symbols', () => {
    const payment: SymbolPool = { mars: 2, venus: 1, mercury: 1, moon: 0 };
    const available: SymbolPool = { mars: 4, venus: 3, mercury: 2, moon: 1 };
    const required: SymbolCost = { mars: 2, venus: 1, mercury: 0, moon: 0, any: 1 };

    expect(validatePayment(payment, available, required)).toBe(true);
  });

  it('should reject payment exceeding available', () => {
    const payment: SymbolPool = { mars: 5, venus: 1, mercury: 0, moon: 0 };
    const available: SymbolPool = { mars: 4, venus: 3, mercury: 2, moon: 1 };
    const required: SymbolCost = { mars: 2, venus: 1, mercury: 0, moon: 0, any: 0 };

    expect(validatePayment(payment, available, required)).toBe(false);
  });

  it('should reject payment not meeting required', () => {
    const payment: SymbolPool = { mars: 1, venus: 1, mercury: 0, moon: 0 };
    const available: SymbolPool = { mars: 4, venus: 3, mercury: 2, moon: 1 };
    const required: SymbolCost = { mars: 2, venus: 1, mercury: 0, moon: 0, any: 0 };

    expect(validatePayment(payment, available, required)).toBe(false);
  });

  it('should reject payment with wrong total', () => {
    const payment: SymbolPool = { mars: 3, venus: 1, mercury: 0, moon: 0 };
    const available: SymbolPool = { mars: 4, venus: 3, mercury: 2, moon: 1 };
    const required: SymbolCost = { mars: 2, venus: 1, mercury: 0, moon: 0, any: 0 };

    expect(validatePayment(payment, available, required)).toBe(false);
  });
});

describe('createAutoPayment', () => {
  it('should create exact payment', () => {
    const available: SymbolPool = { mars: 2, venus: 1, mercury: 0, moon: 0 };
    const required: SymbolCost = { mars: 2, venus: 1, mercury: 0, moon: 0, any: 0 };

    const payment = createAutoPayment(available, required);
    expect(payment).toEqual({
      mars: 2,
      venus: 1,
      mercury: 0,
      moon: 0,
    });
  });

  it('should create payment with "any" symbols', () => {
    const available: SymbolPool = { mars: 3, venus: 1, mercury: 0, moon: 0 };
    const required: SymbolCost = { mars: 2, venus: 1, mercury: 0, moon: 0, any: 1 };

    const payment = createAutoPayment(available, required);
    expect(payment).toEqual({
      mars: 3,
      venus: 1,
      mercury: 0,
      moon: 0,
    });
  });

  it('should return null for insufficient symbols', () => {
    const available: SymbolPool = { mars: 1, venus: 0, mercury: 0, moon: 0 };
    const required: SymbolCost = { mars: 2, venus: 0, mercury: 0, moon: 0, any: 0 };

    const payment = createAutoPayment(available, required);
    expect(payment).toBeNull();
  });

  it('should use symbols in priority order for "any"', () => {
    const available: SymbolPool = { mars: 2, venus: 2, mercury: 0, moon: 0 };
    const required: SymbolCost = { mars: 0, venus: 0, mercury: 0, moon: 0, any: 3 };

    const payment = createAutoPayment(available, required);
    expect(payment).toEqual({
      mars: 2,
      venus: 1,
      mercury: 0,
      moon: 0,
    });
  });
});
