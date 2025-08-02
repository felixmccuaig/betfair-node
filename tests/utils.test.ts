import {
  generatePacketId,
  isValidMarketId,
  formatBetfairPrice,
  convertCurrency,
  isValidSelectionId,
  delay,
  safeJsonParse,
} from '../src/utils';

describe('Utils Functions', () => {
  describe('generatePacketId', () => {
    it('should generate packet IDs within the expected range', () => {
      for (let i = 0; i < 100; i++) {
        const id = generatePacketId();
        expect(id).toBeGreaterThanOrEqual(100000000);
        expect(id).toBeLessThanOrEqual(999999999);
        expect(Number.isInteger(id)).toBe(true);
      }
    });

    it('should generate unique packet IDs', () => {
      const ids = new Set();
      for (let i = 0; i < 1000; i++) {
        const id = generatePacketId();
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }
    });
  });

  describe('isValidMarketId', () => {
    it('should validate correct market ID format', () => {
      expect(isValidMarketId('1.123456789')).toBe(true);
      expect(isValidMarketId('1.1')).toBe(true);
      expect(isValidMarketId('1.999999999999')).toBe(true);
    });

    it('should reject invalid market ID formats', () => {
      expect(isValidMarketId('123456789')).toBe(false);
      expect(isValidMarketId('2.123456789')).toBe(false);
      expect(isValidMarketId('1.')).toBe(false);
      expect(isValidMarketId('1.abc')).toBe(false);
      expect(isValidMarketId('')).toBe(false);
      expect(isValidMarketId('1.123.456')).toBe(false);
    });
  });

  describe('formatBetfairPrice', () => {
    it('should format prices to 2 decimal places', () => {
      expect(formatBetfairPrice(1.999)).toBe(2.0);
      expect(formatBetfairPrice(2.555)).toBe(2.56);
      expect(formatBetfairPrice(3.123456)).toBe(3.12);
      expect(formatBetfairPrice(1.0)).toBe(1.0);
    });

    it('should handle edge cases', () => {
      expect(formatBetfairPrice(0)).toBe(0);
      expect(formatBetfairPrice(0.001)).toBe(0);
      expect(formatBetfairPrice(0.005)).toBe(0.01);
    });
  });

  describe('convertCurrency', () => {
    it('should convert currency using the provided rate', () => {
      expect(convertCurrency(100, 1.5)).toBe(150);
      expect(convertCurrency(50, 0.8)).toBe(40);
      expect(convertCurrency(0, 2.0)).toBe(0);
      expect(convertCurrency(25.5, 1.25)).toBe(31.875);
    });

    it('should handle edge cases', () => {
      expect(convertCurrency(100, 0)).toBe(0);
      expect(convertCurrency(0, 0)).toBe(0);
      expect(convertCurrency(-100, 1.5)).toBe(-150);
    });
  });

  describe('isValidSelectionId', () => {
    it('should validate positive integer selection IDs', () => {
      expect(isValidSelectionId(1)).toBe(true);
      expect(isValidSelectionId(123456)).toBe(true);
      expect(isValidSelectionId(999999999)).toBe(true);
    });

    it('should reject invalid selection IDs', () => {
      expect(isValidSelectionId(0)).toBe(false);
      expect(isValidSelectionId(-1)).toBe(false);
      expect(isValidSelectionId(1.5)).toBe(false);
      expect(isValidSelectionId(NaN)).toBe(false);
      expect(isValidSelectionId(Infinity)).toBe(false);
    });
  });

  describe('delay', () => {
    it('should resolve after the specified delay', async () => {
      const start = Date.now();
      await delay(100);
      const end = Date.now();
      const elapsed = end - start;
      
      // Allow for some variance in timing
      expect(elapsed).toBeGreaterThanOrEqual(90);
      expect(elapsed).toBeLessThan(150);
    });

    it('should handle zero delay', async () => {
      const start = Date.now();
      await delay(0);
      const end = Date.now();
      const elapsed = end - start;
      
      expect(elapsed).toBeLessThan(10);
    });

    it('should return a promise', () => {
      const result = delay(10);
      expect(result).toBeInstanceOf(Promise);
    });
  });

  describe('safeJsonParse', () => {
    it('should parse valid JSON strings', () => {
      const obj = { name: 'John', age: 30 };
      const jsonStr = JSON.stringify(obj);
      
      const result = safeJsonParse(jsonStr);
      expect(result).toEqual(obj);
    });

    it('should handle different data types', () => {
      expect(safeJsonParse('"hello"')).toBe('hello');
      expect(safeJsonParse('123')).toBe(123);
      expect(safeJsonParse('true')).toBe(true);
      expect(safeJsonParse('null')).toBe(null);
      expect(safeJsonParse('[]')).toEqual([]);
    });

    it('should return null for invalid JSON', () => {
      expect(safeJsonParse('invalid json')).toBeNull();
      expect(safeJsonParse('{"invalid": json}')).toBeNull();
      expect(safeJsonParse('')).toBeNull();
      expect(safeJsonParse('undefined')).toBeNull();
    });

    it('should work with generic types', () => {
      interface User {
        name: string;
        age: number;
      }
      
      const user: User = { name: 'John', age: 30 };
      const jsonStr = JSON.stringify(user);
      
      const result = safeJsonParse<User>(jsonStr);
      expect(result).toEqual(user);
      
      // Type checking would happen at compile time
      if (result) {
        expect(result.name).toBe('John');
        expect(result.age).toBe(30);
      }
    });

    it('should handle complex nested objects', () => {
      const complex = {
        user: {
          name: 'John',
          preferences: {
            theme: 'dark',
            notifications: true,
          },
        },
        items: [1, 2, 3],
      };
      
      const jsonStr = JSON.stringify(complex);
      const result = safeJsonParse(jsonStr);
      
      expect(result).toEqual(complex);
    });
  });
});