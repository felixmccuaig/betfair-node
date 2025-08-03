import {
  generatePacketId,
  isValidMarketId,
  formatBetfairPrice,
  convertCurrency,
  isValidSelectionId,
  delay,
  safeJsonParse,
  getTickSize,
  generatePriceLadder,
  getNextTick,
  getPreviousTick,
  getNearestValidPrice,
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

  describe('Price Ladder Functions', () => {
    describe('getTickSize', () => {
      it('should return correct tick sizes for different price ranges', () => {
        // Test each price range according to the specification
        expect(getTickSize(1.5)).toBe(0.01);   // 1.01 → 2
        expect(getTickSize(2.5)).toBe(0.02);   // 2 → 3
        expect(getTickSize(3.5)).toBe(0.05);   // 3 → 4
        expect(getTickSize(5)).toBe(0.1);      // 4 → 6
        expect(getTickSize(7)).toBe(0.2);      // 6 → 10
        expect(getTickSize(15)).toBe(0.5);     // 10 → 20
        expect(getTickSize(25)).toBe(1);       // 20 → 30
        expect(getTickSize(40)).toBe(2);       // 30 → 50
        expect(getTickSize(75)).toBe(5);       // 50 → 100
        expect(getTickSize(500)).toBe(10);     // 100 → 1000
      });

      it('should handle edge cases at range boundaries', () => {
        expect(getTickSize(1.01)).toBe(0.01);
        expect(getTickSize(2)).toBe(0.02);
        expect(getTickSize(3)).toBe(0.05);
        expect(getTickSize(4)).toBe(0.1);
        expect(getTickSize(6)).toBe(0.2);
        expect(getTickSize(10)).toBe(0.5);
        expect(getTickSize(20)).toBe(1);
        expect(getTickSize(30)).toBe(2);
        expect(getTickSize(50)).toBe(5);
        expect(getTickSize(100)).toBe(10);
      });

      it('should use largest increment for prices >= 1000', () => {
        expect(getTickSize(1000)).toBe(10);
        expect(getTickSize(1500)).toBe(10);
      });
    });

    describe('generatePriceLadder', () => {
      it('should generate price ladder with correct increments', () => {
        const ladder = generatePriceLadder(1.01, 2.1);
        
        // Check that all prices are valid
        expect(ladder[0]).toBe(1.01);
        expect(ladder[1]).toBe(1.02);
        expect(ladder[2]).toBe(1.03);
        
        // Find where it transitions to 0.02 increment (at price 2.00)
        const index2 = ladder.findIndex((price: number) => price === 2);
        expect(index2).toBeGreaterThan(-1);
        expect(ladder[index2 + 1]).toBe(2.02);
        expect(ladder[index2 + 2]).toBe(2.04);
      });

      it('should use memoization for identical calls', () => {
        const ladder1 = generatePriceLadder(1.01, 5);
        const ladder2 = generatePriceLadder(1.01, 5);
        
        // Should return the same array reference due to memoization
        expect(ladder1).toBe(ladder2);
      });

      it('should generate different ladders for different ranges', () => {
        const ladder1 = generatePriceLadder(1.01, 3);
        const ladder2 = generatePriceLadder(1.01, 5);
        
        expect(ladder1).not.toBe(ladder2);
        expect(ladder2.length).toBeGreaterThan(ladder1.length);
      });
    });

    describe('getNextTick', () => {
      it('should return next tick for the user examples', () => {
        // User example: 120 -> 130 (should be 130 as 120 is in 100-1000 range with +10 increment)
        expect(getNextTick(120)).toBe(130);
        
        // User example: 3.35 -> 3.40 (should be 3.40 as 3.35 is in 3-4 range with +0.05 increment)
        expect(getNextTick(3.35)).toBe(3.4);
      });

      it('should handle various price ranges correctly', () => {
        expect(getNextTick(1.5)).toBe(1.51);   // 0.01 increment
        expect(getNextTick(2.5)).toBe(2.52);   // 0.02 increment
        expect(getNextTick(3.5)).toBe(3.55);   // 0.05 increment
        expect(getNextTick(5)).toBe(5.1);      // 0.1 increment
        expect(getNextTick(7)).toBe(7.2);      // 0.2 increment
        expect(getNextTick(15)).toBe(15.5);    // 0.5 increment
        expect(getNextTick(25)).toBe(26);      // 1 increment
        expect(getNextTick(40)).toBe(42);      // 2 increment
        expect(getNextTick(75)).toBe(80);      // 5 increment
      });

      it('should return null when exceeding maximum price', () => {
        expect(getNextTick(995)).toBe(null);
        expect(getNextTick(1000)).toBe(null);
      });

      it('should handle edge cases at range boundaries', () => {
        expect(getNextTick(1.99)).toBe(2);     // Last tick before range change
        expect(getNextTick(2.98)).toBe(3);     // Last tick before range change
      });
    });

    describe('getPreviousTick', () => {
      it('should return previous tick correctly', () => {
        expect(getPreviousTick(130)).toBe(120);  // 10 decrement
        expect(getPreviousTick(3.4)).toBe(3.35); // 0.05 decrement
        expect(getPreviousTick(1.52)).toBe(1.51); // 0.01 decrement
        expect(getPreviousTick(2.52)).toBe(2.5);  // 0.02 decrement
      });

      it('should return null when going below minimum price', () => {
        expect(getPreviousTick(1.01)).toBe(null);
        expect(getPreviousTick(1.02)).toBe(1.01);
      });

      it('should handle various price ranges correctly', () => {
        expect(getPreviousTick(5.1)).toBe(5);     // 0.1 decrement
        expect(getPreviousTick(7.2)).toBe(7);     // 0.2 decrement
        expect(getPreviousTick(15.5)).toBe(15);   // 0.5 decrement
        expect(getPreviousTick(26)).toBe(25);     // 1 decrement
        expect(getPreviousTick(42)).toBe(40);     // 2 decrement
        expect(getPreviousTick(80)).toBe(75);     // 5 decrement
      });
    });

    describe('getNearestValidPrice', () => {
      it('should round to nearest valid price by default', () => {
        expect(getNearestValidPrice(1.234)).toBe(1.23); // Rounds down in 0.01 range
        expect(getNearestValidPrice(1.236)).toBe(1.24); // Rounds up in 0.01 range
        expect(getNearestValidPrice(2.511)).toBe(2.52); // Rounds up in 0.02 range
        expect(getNearestValidPrice(3.123)).toBe(3.1);  // Rounds down in 0.05 range
      });

      it('should round up when direction is "up"', () => {
        expect(getNearestValidPrice(1.234, 'up')).toBe(1.24);
        expect(getNearestValidPrice(2.501, 'up')).toBe(2.52);
        expect(getNearestValidPrice(3.101, 'up')).toBe(3.15);
      });

      it('should round down when direction is "down"', () => {
        expect(getNearestValidPrice(1.236, 'down')).toBe(1.23);
        expect(getNearestValidPrice(2.519, 'down')).toBe(2.5);
        expect(getNearestValidPrice(3.149, 'down')).toBe(3.1);
      });

      it('should handle edge cases', () => {
        expect(getNearestValidPrice(0.5)).toBe(1.01);   // Below minimum
        expect(getNearestValidPrice(1500)).toBe(1000);  // Above maximum
        expect(getNearestValidPrice(1.01)).toBe(1.01);  // Already valid
      });

      it('should handle boundary prices correctly', () => {
        expect(getNearestValidPrice(1.999)).toBe(2);    // At boundary
        expect(getNearestValidPrice(2.999)).toBe(3);    // At boundary
        expect(getNearestValidPrice(99.9)).toBe(100);   // At boundary
      });
    });
  });
});