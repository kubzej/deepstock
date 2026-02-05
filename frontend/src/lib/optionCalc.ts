/**
 * Options Calculator Utilities
 *
 * Calculation functions for options strategies:
 * - Sell Put (Cash-Secured Put)
 * - Sell Call (Covered Call)
 * - Buy Call
 * - Buy Put
 */

// ==========================================
// Days to Expiration
// ==========================================

/**
 * Calculate days until expiration
 */
export function calculateDTE(expirationDate: Date | string): number {
  const expDate =
    typeof expirationDate === 'string'
      ? new Date(expirationDate)
      : expirationDate;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expDate.setHours(0, 0, 0, 0);

  const diffTime = expDate.getTime() - today.getTime();
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

// ==========================================
// Basic Calculations
// ==========================================

/**
 * Calculate option yield (premium / strike or stock price)
 */
export function calculateOptionYield(premium: number, base: number): number {
  if (base <= 0) return 0;
  return (premium / base) * 100;
}

/**
 * Calculate annualized return from yield and DTE
 */
export function calculateAnnualizedReturn(
  yieldPercent: number,
  dte: number
): number {
  if (dte <= 0) return 0;
  return (yieldPercent / dte) * 365;
}

/**
 * Calculate buffer (distance from current price to strike)
 */
export function calculateBuffer(
  stockPrice: number,
  strike: number,
  optionType: 'put' | 'call'
): number {
  if (stockPrice <= 0) return 0;

  if (optionType === 'put') {
    // For puts: how much stock needs to fall to reach strike
    return ((stockPrice - strike) / stockPrice) * 100;
  } else {
    // For calls: how much stock needs to rise to reach strike
    return ((strike - stockPrice) / stockPrice) * 100;
  }
}

/**
 * Calculate break-even price
 */
export function calculateBreakeven(
  optionType: 'put' | 'call',
  strike: number,
  premium: number
): number {
  if (optionType === 'put') {
    return strike - premium;
  } else {
    return strike + premium;
  }
}

/**
 * Calculate blocked capital for cash-secured puts
 */
export function calculateBlockedCapital(
  strike: number,
  contracts: number
): number {
  return strike * contracts * 100;
}

/**
 * Calculate effective buy price for puts
 */
export function calculateEffectiveBuyPrice(
  strike: number,
  premium: number
): number {
  return strike - premium;
}

/**
 * Calculate discount from current price
 */
export function calculateDiscountFromCurrent(
  stockPrice: number,
  effectivePrice: number
): number {
  if (stockPrice <= 0) return 0;
  return ((stockPrice - effectivePrice) / stockPrice) * 100;
}

// ==========================================
// Sell Put Calculation
// ==========================================

export interface SellPutCalculation {
  stockPrice: number;
  strike: number;
  premium: number;
  contracts: number;
  dte: number;
  yieldPercent: number;
  annualizedReturn: number;
  bufferPercent: number;
  breakeven: number;
  blockedCapital: number;
  totalPremium: number;
  effectiveBuyPrice: number;
  discountPercent: number;
}

export function calculateSellPut(
  stockPrice: number,
  strike: number,
  premium: number,
  contracts: number,
  expirationDate: Date | string
): SellPutCalculation {
  const dte = calculateDTE(expirationDate);
  const yieldPercent = calculateOptionYield(premium, strike);
  const annualizedReturn = calculateAnnualizedReturn(yieldPercent, dte);
  const bufferPercent = calculateBuffer(stockPrice, strike, 'put');
  const breakeven = calculateBreakeven('put', strike, premium);
  const blockedCapital = calculateBlockedCapital(strike, contracts);
  const totalPremium = premium * contracts * 100;
  const effectiveBuyPrice = calculateEffectiveBuyPrice(strike, premium);
  const discountPercent = calculateDiscountFromCurrent(
    stockPrice,
    effectiveBuyPrice
  );

  return {
    stockPrice,
    strike,
    premium,
    contracts,
    dte,
    yieldPercent,
    annualizedReturn,
    bufferPercent,
    breakeven,
    blockedCapital,
    totalPremium,
    effectiveBuyPrice,
    discountPercent,
  };
}

// ==========================================
// Sell Call Calculation
// ==========================================

export interface SellCallCalculation {
  stockPrice: number;
  strike: number;
  premium: number;
  contracts: number;
  dte: number;
  yieldPercent: number;
  annualizedReturn: number;
  bufferPercent: number;
  maxProfit: number;
  totalPremium: number;
}

export function calculateSellCall(
  stockPrice: number,
  strike: number,
  premium: number,
  contracts: number,
  expirationDate: Date | string
): SellCallCalculation {
  const dte = calculateDTE(expirationDate);
  const yieldPercent = calculateOptionYield(premium, stockPrice);
  const annualizedReturn = calculateAnnualizedReturn(yieldPercent, dte);
  const bufferPercent = calculateBuffer(stockPrice, strike, 'call');
  const totalPremium = premium * contracts * 100;

  // Max profit = premium + upside to strike (if strike > current price)
  const upside = Math.max(0, strike - stockPrice) * contracts * 100;
  const maxProfit = totalPremium + upside;

  return {
    stockPrice,
    strike,
    premium,
    contracts,
    dte,
    yieldPercent,
    annualizedReturn,
    bufferPercent,
    maxProfit,
    totalPremium,
  };
}

// ==========================================
// Buy Call Calculation
// ==========================================

export interface BuyCallCalculation {
  stockPrice: number;
  strike: number;
  premium: number;
  contracts: number;
  dte: number;
  maxLoss: number;
  breakeven: number;
  requiredMove: number;
  leverage: number;
  totalCost: number;
}

export function calculateBuyCall(
  stockPrice: number,
  strike: number,
  premium: number,
  contracts: number,
  expirationDate: Date | string
): BuyCallCalculation {
  const dte = calculateDTE(expirationDate);
  const totalCost = premium * contracts * 100;
  const maxLoss = totalCost;
  const breakeven = strike + premium;

  // Required move to reach break-even
  const requiredMove = ((breakeven - stockPrice) / stockPrice) * 100;

  // Leverage = controlled value / paid premium
  const controlledValue = stockPrice * contracts * 100;
  const leverage = controlledValue / totalCost;

  return {
    stockPrice,
    strike,
    premium,
    contracts,
    dte,
    maxLoss,
    breakeven,
    requiredMove,
    leverage,
    totalCost,
  };
}

// ==========================================
// Buy Put Calculation
// ==========================================

export interface BuyPutCalculation {
  stockPrice: number;
  strike: number;
  premium: number;
  contracts: number;
  dte: number;
  maxLoss: number;
  maxProfit: number;
  breakeven: number;
  requiredMove: number;
  totalCost: number;
}

export function calculateBuyPut(
  stockPrice: number,
  strike: number,
  premium: number,
  contracts: number,
  expirationDate: Date | string
): BuyPutCalculation {
  const dte = calculateDTE(expirationDate);
  const totalCost = premium * contracts * 100;
  const maxLoss = totalCost;
  const breakeven = strike - premium;

  // Max profit if stock goes to 0
  const maxProfit = breakeven * contracts * 100;

  // Required move to reach break-even
  const requiredMove = ((stockPrice - breakeven) / stockPrice) * 100;

  return {
    stockPrice,
    strike,
    premium,
    contracts,
    dte,
    maxLoss,
    maxProfit,
    breakeven,
    requiredMove,
    totalCost,
  };
}
