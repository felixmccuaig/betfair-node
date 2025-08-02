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