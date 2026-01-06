import type { SymbolPool, SymbolCost } from './types';

export function canPayCost(available: SymbolPool, required: SymbolCost): boolean {
  // Try to satisfy specific symbol requirements first
  if (available.mars < required.mars) return false;
  if (available.venus < required.venus) return false;
  if (available.mercury < required.mercury) return false;
  if (available.moon < required.moon) return false;

  // Calculate remaining symbols after paying specific costs
  const remaining = {
    mars: available.mars - required.mars,
    venus: available.venus - required.venus,
    mercury: available.mercury - required.mercury,
    moon: available.moon - required.moon,
  };

  // Check if we can pay "any" symbols with what's left
  const totalRemaining =
    remaining.mars + remaining.venus + remaining.mercury + remaining.moon;

  return totalRemaining >= required.any;
}

export function deductSymbols(pool: SymbolPool, payment: SymbolPool): SymbolPool {
  return {
    mars: pool.mars - payment.mars,
    venus: pool.venus - payment.venus,
    mercury: pool.mercury - payment.mercury,
    moon: pool.moon - payment.moon,
  };
}

export function getCounterBidCost(originalCost: SymbolCost): SymbolCost {
  return {
    ...originalCost,
    any: originalCost.any + 1,
  };
}

export function getFinalBidCost(originalCost: SymbolCost): SymbolCost {
  return {
    ...originalCost,
    any: originalCost.any + 2,
  };
}

export function validatePayment(
  payment: SymbolPool,
  available: SymbolPool,
  required: SymbolCost
): boolean {
  // Check payment doesn't exceed available
  if (payment.mars > available.mars) return false;
  if (payment.venus > available.venus) return false;
  if (payment.mercury > available.mercury) return false;
  if (payment.moon > available.moon) return false;

  // Check payment meets required specific symbols
  if (payment.mars < required.mars) return false;
  if (payment.venus < required.venus) return false;
  if (payment.mercury < required.mercury) return false;
  if (payment.moon < required.moon) return false;

  // Calculate total payment (for "any" symbols)
  const totalPayment = payment.mars + payment.venus + payment.mercury + payment.moon;
  const totalRequired = required.mars + required.venus + required.mercury + required.moon + required.any;

  return totalPayment === totalRequired;
}

export function createAutoPayment(
  available: SymbolPool,
  required: SymbolCost
): SymbolPool | null {
  if (!canPayCost(available, required)) {
    return null;
  }

  // Pay specific requirements
  let payment: SymbolPool = {
    mars: required.mars,
    venus: required.venus,
    mercury: required.mercury,
    moon: required.moon,
  };

  // Pay "any" symbols with remaining symbols (prefer in order: mars, venus, mercury, moon)
  let anyRemaining = required.any;
  const remaining = {
    mars: available.mars - required.mars,
    venus: available.venus - required.venus,
    mercury: available.mercury - required.mercury,
    moon: available.moon - required.moon,
  };

  // Use mars first
  const marsForAny = Math.min(remaining.mars, anyRemaining);
  payment.mars += marsForAny;
  anyRemaining -= marsForAny;

  // Then venus
  const venusForAny = Math.min(remaining.venus, anyRemaining);
  payment.venus += venusForAny;
  anyRemaining -= venusForAny;

  // Then mercury
  const mercuryForAny = Math.min(remaining.mercury, anyRemaining);
  payment.mercury += mercuryForAny;
  anyRemaining -= mercuryForAny;

  // Finally moon
  const moonForAny = Math.min(remaining.moon, anyRemaining);
  payment.moon += moonForAny;
  anyRemaining -= moonForAny;

  return payment;
}
