import {
  StreamApiState,
  createStreamApiState,
  setAuthCredentials,
  getStreamCache,
} from '../src/betfair-exchange-stream-api';

import {
  CurrencyRate,
  MarketCache,
} from '../src/betfair-exchange-stream-api-types';

// Mock the TLS and readline modules
jest.mock('tls');
jest.mock('readline');

describe('Betfair Exchange Stream API Functions', () => {
  let currencyRate: CurrencyRate;
  let mockMarketChangeCallback: jest.Mock;
  let initialState: StreamApiState;

  beforeEach(() => {
    currencyRate = { currencyCode: 'AUD', rate: 1.0 };
    mockMarketChangeCallback = jest.fn((marketCache: { [key: string]: MarketCache }, deltas: string[]) => {
      console.log('Market change:', marketCache, deltas);
    });

    initialState = createStreamApiState(
      'test-auth-token',
      'test-app-key',
      false, // segmentationEnabled
      500,   // conflateMs
      5000,  // heartbeatMs
      currencyRate,
      mockMarketChangeCallback
    );

    // Mock console to avoid cluttering test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  describe('createStreamApiState', () => {
    it('should create initial stream API state', () => {
      expect(initialState.authToken).toBe('test-auth-token');
      expect(initialState.appKey).toBe('test-app-key');
      expect(initialState.authenticationStatus).toBe(false);
      expect(initialState.segmentationEnabled).toBe(false);
      expect(initialState.conflateMs).toBe(500);
      expect(initialState.heartbeatMs).toBe(5000);
      expect(initialState.audCurrencyRate).toBe(currencyRate);
      expect(initialState.marketChangeCallback).toBe(mockMarketChangeCallback);
      expect(initialState.pendingPackets).toEqual({});
      expect(initialState.lastMarkets).toEqual([]);
    });

    it('should initialize stream decoder state', () => {
      expect(initialState.streamDecoder).toBeDefined();
      expect(initialState.streamDecoder.marketCache).toEqual({});
      expect(initialState.streamDecoder.currencyRate).toBe(currencyRate);
      expect(initialState.streamDecoder.deltas).toEqual([]);
      expect(initialState.streamDecoder.subscribedMarkets).toEqual([]);
    });

    it('should initialize heartbeat state', () => {
      expect(initialState.heartbeat).toBeDefined();
      expect(initialState.heartbeat.isBeating).toBe(false);
      expect(initialState.heartbeat.heartbeatMs).toBe(5000);
      expect(initialState.heartbeat.onHeartAttack).toBeDefined();
    });
  });

  describe('setAuthCredentials', () => {
    it('should update authentication credentials', () => {
      const updatedState = setAuthCredentials(
        initialState,
        'new-app-key',
        'new-auth-token'
      );

      expect(updatedState.appKey).toBe('new-app-key');
      expect(updatedState.authToken).toBe('new-auth-token');
      expect(updatedState.authenticationStatus).toBe(false); // Should remain unchanged
    });

    it('should preserve other state properties', () => {
      const updatedState = setAuthCredentials(
        initialState,
        'new-app-key',
        'new-auth-token'
      );

      expect(updatedState.conflateMs).toBe(initialState.conflateMs);
      expect(updatedState.heartbeatMs).toBe(initialState.heartbeatMs);
      expect(updatedState.audCurrencyRate).toBe(initialState.audCurrencyRate);
      expect(updatedState.marketChangeCallback).toBe(initialState.marketChangeCallback);
    });
  });

  describe('getStreamCache', () => {
    it('should return empty cache initially', () => {
      const cache = getStreamCache(initialState);
      expect(cache).toEqual({});
    });

    it('should return market cache from stream decoder', () => {
      const mockMarketCache = {
        '1.123456': {
          marketId: '1.123456',
          marketDefinition: {} as any,
          runners: {},
          totalMatched: 100,
          lastValueTraded: 2.5,
          published: Date.now(),
        },
      };

      const stateWithCache = {
        ...initialState,
        streamDecoder: {
          ...initialState.streamDecoder,
          marketCache: mockMarketCache,
        },
      };

      const cache = getStreamCache(stateWithCache);
      expect(cache).toBe(mockMarketCache);
    });
  });

  describe('State Management', () => {
    it('should maintain immutable state updates', () => {
      const originalState = { ...initialState };
      const updatedState = setAuthCredentials(
        initialState,
        'new-app-key',
        'new-auth-token'
      );

      // Original state should be unchanged
      expect(initialState.appKey).toBe(originalState.appKey);
      expect(initialState.authToken).toBe(originalState.authToken);

      // Updated state should have new values
      expect(updatedState.appKey).toBe('new-app-key');
      expect(updatedState.authToken).toBe('new-auth-token');

      // States should be different objects
      expect(updatedState).not.toBe(initialState);
    });
  });

  describe('Integration with Dependencies', () => {
    it('should create heartbeat with correct configuration', () => {
      const state = createStreamApiState(
        'token',
        'key',
        true,
        1000,
        3000,
        currencyRate,
        mockMarketChangeCallback
      );

      expect(state.heartbeat.heartbeatMs).toBe(3000);
      expect(state.heartbeat.isBeating).toBe(false);
      expect(typeof state.heartbeat.onHeartAttack).toBe('function');
    });

    it('should create stream decoder with correct currency rate', () => {
      const testCurrencyRate: CurrencyRate = { currencyCode: 'EUR', rate: 0.85 };
      const state = createStreamApiState(
        'token',
        'key',
        false,
        500,
        5000,
        testCurrencyRate,
        mockMarketChangeCallback
      );

      expect(state.streamDecoder.currencyRate).toBe(testCurrencyRate);
    });
  });

  describe('Configuration Validation', () => {
    it('should handle different segmentation settings', () => {
      const segmentedState = createStreamApiState(
        'token',
        'key',
        true, // segmentationEnabled
        500,
        5000,
        currencyRate,
        mockMarketChangeCallback
      );

      expect(segmentedState.segmentationEnabled).toBe(true);

      const nonSegmentedState = createStreamApiState(
        'token',
        'key',
        false, // segmentationEnabled
        500,
        5000,
        currencyRate,
        mockMarketChangeCallback
      );

      expect(nonSegmentedState.segmentationEnabled).toBe(false);
    });

    it('should handle different conflate and heartbeat intervals', () => {
      const state = createStreamApiState(
        'token',
        'key',
        false,
        250,  // conflateMs
        10000, // heartbeatMs
        currencyRate,
        mockMarketChangeCallback
      );

      expect(state.conflateMs).toBe(250);
      expect(state.heartbeatMs).toBe(10000);
      expect(state.heartbeat.heartbeatMs).toBe(10000);
    });
  });

  describe('Error Handling', () => {
    it('should handle heartbeat onHeartAttack callback', () => {
      const state = createStreamApiState(
        'token',
        'key',
        false,
        500,
        5000,
        currencyRate,
        mockMarketChangeCallback
      );

      // Test that heartAttack callback doesn't throw
      expect(() => {
        state.heartbeat.onHeartAttack();
      }).not.toThrow();

      expect(console.warn).toHaveBeenCalledWith(
        'Heartbeat timeout detected - stream may be stale, but continuing...'
      );
    });
  });

  describe('Callback Integration', () => {
    it('should store market change callback correctly', () => {
      const customCallback = jest.fn();
      const state = createStreamApiState(
        'token',
        'key',
        false,
        500,
        5000,
        currencyRate,
        customCallback
      );

      expect(state.marketChangeCallback).toBe(customCallback);
    });

    it('should handle market change callback invocation', () => {
      const testMarketCache = {
        '1.123456': {
          marketId: '1.123456',
          marketDefinition: {} as any,
          runners: {},
          totalMatched: 0,
          lastValueTraded: 0,
          published: Date.now(),
        },
      };
      const testDeltas = ['test delta'];

      // Directly call the callback to test it works
      initialState.marketChangeCallback(testMarketCache, testDeltas);

      expect(mockMarketChangeCallback).toHaveBeenCalledWith(testMarketCache, testDeltas);
    });
  });
});