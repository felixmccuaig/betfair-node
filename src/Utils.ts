/**
 * Generates a random packet ID for API requests
 * @returns A random number between 100000000 and 999999999
 */
export const generatePacketId = (): number => {
  const min = 100000000;
  const max = 999999999;
  return Math.floor(Math.random() * (max - min + 1) + min);
};

/**
 * Validates if a string is a valid market ID format
 * @param marketId - The market ID to validate
 * @returns True if valid, false otherwise
 */
export const isValidMarketId = (marketId: string): boolean => {
  // Market IDs are typically in format like "1.123456789"
  return /^1\.\d+$/.test(marketId);
};

/**
 * Converts a price to the Betfair price format
 * @param price - The price to convert
 * @returns The formatted price
 */
export const formatBetfairPrice = (price: number): number => {
  return Math.round(price * 100) / 100;
};

/**
 * Converts currency amount using the provided rate
 * @param amount - The amount to convert
 * @param rate - The currency conversion rate
 * @returns The converted amount
 */
export const convertCurrency = (amount: number, rate: number): number => {
  return amount * rate;
};

/**
 * Validates if a selection ID is valid
 * @param selectionId - The selection ID to validate
 * @returns True if valid, false otherwise
 */
export const isValidSelectionId = (selectionId: number): boolean => {
  return Number.isInteger(selectionId) && selectionId > 0;
};

/**
 * Creates a delay promise
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after the delay
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Safely parses JSON with error handling
 * @param json - JSON string to parse
 * @returns Parsed object or null if invalid
 */
export const safeJsonParse = <T>(json: string): T | null => {
  try {
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
};

/**
 * Price ladder tick size definitions based on Betfair's price ranges
 */
const PRICE_TICK_RANGES = [
  { min: 1.01, max: 2, increment: 0.01 },
  { min: 2, max: 3, increment: 0.02 },
  { min: 3, max: 4, increment: 0.05 },
  { min: 4, max: 6, increment: 0.1 },
  { min: 6, max: 10, increment: 0.2 },
  { min: 10, max: 20, increment: 0.5 },
  { min: 20, max: 30, increment: 1 },
  { min: 30, max: 50, increment: 2 },
  { min: 50, max: 100, increment: 5 },
  { min: 100, max: 1000, increment: 10 }
] as const;

/**
 * Cache for generated price ladders
 */
const priceLadderCache = new Map<string, number[]>();

/**
 * Finds the appropriate tick size for a given price
 * @param price - The price to find the tick size for
 * @returns The tick increment for the price range
 */
export const getTickSize = (price: number): number => {
  for (const range of PRICE_TICK_RANGES) {
    if (price >= range.min && price < range.max) {
      return range.increment;
    }
  }
  // For prices >= 1000, use the largest increment
  return PRICE_TICK_RANGES[PRICE_TICK_RANGES.length - 1]!.increment;
};

/**
 * Generates a complete price ladder for a given range with memoization
 * @param minPrice - Minimum price (default: 1.01)
 * @param maxPrice - Maximum price (default: 1000)
 * @returns Array of valid prices in the ladder
 */
export const generatePriceLadder = (minPrice: number = 1.01, maxPrice: number = 1000): number[] => {
  const cacheKey = `${minPrice}-${maxPrice}`;
  
  if (priceLadderCache.has(cacheKey)) {
    return priceLadderCache.get(cacheKey)!;
  }

  const ladder: number[] = [];
  let currentPrice = minPrice;

  while (currentPrice <= maxPrice) {
    // Round to avoid floating point precision issues
    const roundedPrice = Math.round(currentPrice * 100) / 100;
    ladder.push(roundedPrice);
    
    const tickSize = getTickSize(currentPrice);
    currentPrice += tickSize;
  }

  priceLadderCache.set(cacheKey, ladder);
  return ladder;
};

/**
 * Gets the next valid tick price from a given price
 * @param price - The current price
 * @returns The next valid price in the ladder, or null if at maximum
 */
export const getNextTick = (price: number): number | null => {
  const tickSize = getTickSize(price);
  const nextPrice = price + tickSize;
  
  // Round to avoid floating point precision issues
  const roundedNext = Math.round(nextPrice * 100) / 100;
  
  // Check if we've exceeded the maximum price
  if (roundedNext > 1000) {
    return null;
  }
  
  return roundedNext;
};

/**
 * Gets the previous valid tick price from a given price
 * @param price - The current price
 * @returns The previous valid price in the ladder, or null if at minimum
 */
export const getPreviousTick = (price: number): number | null => {
  // Find the tick size for the price we're moving to
  const tickSize = getTickSize(price);
  const prevPrice = price - tickSize;
  
  // Round to avoid floating point precision issues
  const roundedPrev = Math.round(prevPrice * 100) / 100;
  
  // Check if we've gone below the minimum price
  if (roundedPrev < 1.01) {
    return null;
  }
  
  return roundedPrev;
};

/**
 * Finds the nearest valid price in the ladder
 * @param price - The price to find the nearest valid price for
 * @param direction - 'up' to round up, 'down' to round down, 'nearest' for closest
 * @returns The nearest valid price in the ladder
 */
export const getNearestValidPrice = (price: number, direction: 'up' | 'down' | 'nearest' = 'nearest'): number => {
  if (price < 1.01) return 1.01;
  if (price > 1000) return 1000;
  
  const tickSize = getTickSize(price);
  const range = PRICE_TICK_RANGES.find(r => price >= r.min && price < r.max);
  
  if (!range) {
    // For prices >= 1000, use the last range
    const lastRange = PRICE_TICK_RANGES[PRICE_TICK_RANGES.length - 1]!;
    const steps = Math.floor((price - lastRange.min) / lastRange.increment);
    return Math.round((lastRange.min + steps * lastRange.increment) * 100) / 100;
  }
  
  // Calculate steps from the range minimum
  const stepsFromMin = (price - range.min) / range.increment;
  
  let validPrice: number;
  if (direction === 'up') {
    validPrice = range.min + Math.ceil(stepsFromMin) * range.increment;
  } else if (direction === 'down') {
    validPrice = range.min + Math.floor(stepsFromMin) * range.increment;
  } else {
    validPrice = range.min + Math.round(stepsFromMin) * range.increment;
  }
  
  return Math.round(validPrice * 100) / 100;
};