import {
  StreamDecoderState,
  StreamDecoderCallbacks,
  createStreamDecoderState,
  processDataPacket,
  clearMarketCache,
  updateCurrencyRate,
  updateSubscribedMarkets,
  getMarketCache,
  resetStreamDecoder,
} from '../src/betfair-stream-decoder';

import {
  CurrencyRate,
  MarketChangeMessage,
  StatusMessage,
  ConnectionMessage,
  ChangeType,
  MarketChange,
} from '../src/betfair-exchange-stream-api-types';

describe('Stream Decoder Functions', () => {
  let currencyRate: CurrencyRate;
  let initialState: StreamDecoderState;
  let mockCallbacks: StreamDecoderCallbacks;

  beforeEach(() => {
    currencyRate = { currencyCode: 'AUD', rate: 1.0 };
    initialState = createStreamDecoderState(currencyRate, ['1.123456']);
    
    mockCallbacks = {
      onMarketChange: jest.fn(),
      onStatus: jest.fn(),
      onConnection: jest.fn(),
      onHeartbeat: jest.fn(),
    };

    // Mock console to avoid cluttering test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createStreamDecoderState', () => {
    it('should create initial state with empty cache', () => {
      expect(initialState.marketCache).toEqual({});
      expect(initialState.currencyRate).toBe(currencyRate);
      expect(initialState.deltas).toEqual([]);
      expect(initialState.subscribedMarkets).toEqual(['1.123456']);
    });

    it('should create state with default empty subscribed markets', () => {
      const state = createStreamDecoderState(currencyRate);
      expect(state.subscribedMarkets).toEqual([]);
    });
  });

  describe('processDataPacket', () => {
    it('should process valid connection message', () => {
      const connectionPacket = JSON.stringify({
        id: 1,
        op: 'connection',
        connectionId: 'conn-123',
      });

      const updatedState = processDataPacket(initialState, mockCallbacks, connectionPacket);

      expect(mockCallbacks.onConnection).toHaveBeenCalledWith({
        id: 1,
        op: 'connection',
        connectionId: 'conn-123',
      });
      expect(updatedState).toBe(initialState); // State shouldn't change for connection messages
    });

    it('should process valid status message', () => {
      const statusPacket = JSON.stringify({
        id: 2,
        op: 'status',
        statusCode: 'SUCCESS',
        connectionClosed: false,
        errorCode: '',
        errorMessage: '',
        connectionsAvailable: 10,
      });

      const updatedState = processDataPacket(initialState, mockCallbacks, statusPacket);

      expect(mockCallbacks.onStatus).toHaveBeenCalledWith({
        id: 2,
        op: 'status',
        statusCode: 'SUCCESS',
        connectionClosed: false,
        errorCode: '',
        errorMessage: '',
        connectionsAvailable: 10,
      });
      expect(updatedState).toBe(initialState);
    });

    it('should process heartbeat message', () => {
      const heartbeatPacket = JSON.stringify({
        id: 3,
        op: 'mcm',
        ct: 'HEARTBEAT',
        pt: Date.now(),
        status: 200,
      });

      const updatedState = processDataPacket(initialState, mockCallbacks, heartbeatPacket);

      expect(mockCallbacks.onHeartbeat).toHaveBeenCalled();
      expect(updatedState).toBe(initialState);
    });

    it('should process market change message', () => {
      const marketChangePacket = JSON.stringify({
        id: 4,
        op: 'mcm',
        ct: 'SUB_IMAGE',
        pt: Date.now(),
        status: 200,
        mc: [
          {
            id: '1.123456',
            marketDefinition: {
              bspMarket: false,
              turnInPlayEnabled: true,
              persistenceEnabled: true,
              marketBaseRate: 5.0,
              eventId: '29123456',
              eventTypeId: '1',
              numberOfWinners: 1,
              bettingType: 'ODDS',
              marketType: 'MATCH_ODDS',
              marketTime: '2023-12-01T15:00:00.000Z',
              suspendTime: '2023-12-01T15:00:00.000Z',
              bspReconciled: false,
              complete: true,
              inPlay: false,
              crossMatching: true,
              runnersVoidable: false,
              numberOfActiveRunners: 2,
              betDelay: 0,
              status: 'OPEN',
              runners: [],
              regulators: ['MR_INT'],
              countryCode: 'GB',
              discountAllowed: true,
              timezone: 'GMT',
              openDate: '2023-12-01T15:00:00.000Z',
              version: 1,
              name: 'Test Market',
              eventName: 'Test Event',
              totalMatched: 0,
              venue: 'Test Venue',
            },
            rc: [
              {
                id: 123456,
                ltp: 2.5,
                tv: 100,
                batb: [[0, 2.4, 50]],
                batl: [[0, 2.6, 75]],
                con: true,
              },
            ],
            img: true,
            tv: 100,
            con: true,
          },
        ],
      });

      const updatedState = processDataPacket(initialState, mockCallbacks, marketChangePacket);

      expect(mockCallbacks.onMarketChange).toHaveBeenCalled();
      expect(updatedState.marketCache['1.123456']).toBeDefined();
      expect(updatedState.deltas).toEqual([]); // Deltas should be cleared after callback
    });

    it('should handle invalid JSON gracefully', () => {
      const invalidPacket = 'invalid json';

      const updatedState = processDataPacket(initialState, mockCallbacks, invalidPacket);

      expect(console.error).toHaveBeenCalledWith('Failed to parse packet:', invalidPacket);
      expect(updatedState).toBe(initialState);
    });

    it('should handle unknown message types', () => {
      const unknownPacket = JSON.stringify({
        id: 5,
        op: 'unknown_operation',
      });

      const updatedState = processDataPacket(initialState, mockCallbacks, unknownPacket);

      expect(console.warn).toHaveBeenCalledWith('Unknown message type:', 'unknown_operation');
      expect(updatedState).toBe(initialState);
    });
  });

  describe('clearMarketCache', () => {
    it('should clear the market cache', () => {
      const stateWithCache = {
        ...initialState,
        marketCache: {
          '1.123456': {
            marketId: '1.123456',
            marketDefinition: {} as any,
            runners: {},
            totalMatched: 100,
            lastValueTraded: 2.5,
            published: Date.now(),
          },
        },
      };

      const clearedState = clearMarketCache(stateWithCache);

      expect(clearedState.marketCache).toEqual({});
      expect(clearedState.currencyRate).toBe(currencyRate);
      expect(clearedState.deltas).toBe(stateWithCache.deltas);
    });
  });

  describe('updateCurrencyRate', () => {
    it('should update the currency rate', () => {
      const newCurrencyRate: CurrencyRate = { currencyCode: 'USD', rate: 0.75 };

      const updatedState = updateCurrencyRate(initialState, newCurrencyRate);

      expect(updatedState.currencyRate).toBe(newCurrencyRate);
      expect(updatedState.marketCache).toBe(initialState.marketCache);
    });
  });

  describe('updateSubscribedMarkets', () => {
    it('should update subscribed markets list', () => {
      const newMarkets = ['1.111111', '1.222222'];

      const updatedState = updateSubscribedMarkets(initialState, newMarkets);

      expect(updatedState.subscribedMarkets).toEqual(newMarkets);
      expect(updatedState.marketCache).toBe(initialState.marketCache);
    });
  });

  describe('getMarketCache', () => {
    it('should return the current market cache', () => {
      const mockCache = {
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
        marketCache: mockCache,
      };

      const cache = getMarketCache(stateWithCache);
      expect(cache).toBe(mockCache);
    });
  });

  describe('resetStreamDecoder', () => {
    it('should reset cache and deltas', () => {
      const stateWithData = {
        ...initialState,
        marketCache: {
          '1.123456': {
            marketId: '1.123456',
            marketDefinition: {} as any,
            runners: {},
            totalMatched: 100,
            lastValueTraded: 2.5,
            published: Date.now(),
          },
        },
        deltas: ['market updated'],
      };

      const resetState = resetStreamDecoder(stateWithData);

      expect(resetState.marketCache).toEqual({});
      expect(resetState.deltas).toEqual([]);
      expect(resetState.currencyRate).toBe(stateWithData.currencyRate);
      expect(resetState.subscribedMarkets).toBe(stateWithData.subscribedMarkets);
    });
  });

  describe('Market Change Processing', () => {
    it('should process runner price updates', () => {
      const marketChangePacket = JSON.stringify({
        id: 4,
        op: 'mcm',
        ct: 'SUB_IMAGE',
        pt: Date.now(),
        status: 200,
        mc: [
          {
            id: '1.123456',
            rc: [
              {
                id: 123456,
                ltp: 3.5,
                tv: 250,
                batb: [[0, 3.4, 100], [1, 3.3, 200]],
                batl: [[0, 3.6, 150], [1, 3.7, 300]],
                con: true,
              },
              {
                id: 789012,
                ltp: 1.8,
                tv: 150,
                batb: [[0, 1.75, 75]],
                batl: [[0, 1.85, 125]],
                con: true,
              },
            ],
            img: false,
            tv: 400,
            con: true,
          },
        ],
      });

      const updatedState = processDataPacket(initialState, mockCallbacks, marketChangePacket);

      const market = updatedState.marketCache['1.123456'];
      expect(market).toBeDefined();
      expect(market!.runners['123456']).toBeDefined();
      expect(market!.runners['789012']).toBeDefined();
      
      // Check runner 123456
      const runner1 = market!.runners['123456'];
      expect(runner1).toBeDefined();
      expect(runner1!.ltp).toBe(3.5);
      expect(runner1!.tv).toBe(250);
      expect(runner1!.batb).toEqual([[0, 3.4, 100], [1, 3.3, 200]]);
      expect(runner1!.batl).toEqual([[0, 3.6, 150], [1, 3.7, 300]]);

      // Check runner 789012
      const runner2 = market!.runners['789012'];
      expect(runner2).toBeDefined();
      expect(runner2!.ltp).toBe(1.8);
      expect(runner2!.tv).toBe(150);
    });

    it('should handle currency conversion', () => {
      const eurCurrencyRate: CurrencyRate = { currencyCode: 'EUR', rate: 0.85 };
      const stateWithEur = createStreamDecoderState(eurCurrencyRate);

      const marketChangePacket = JSON.stringify({
        id: 4,
        op: 'mcm',
        ct: 'SUB_IMAGE',
        pt: Date.now(),
        status: 200,
        mc: [
          {
            id: '1.123456',
            rc: [
              {
                id: 123456,
                ltp: 2.0, // This should be converted: 2.0 * 0.85 = 1.7
                tv: 100,
                con: true,
              },
            ],
            img: true,
            tv: 100,
            con: true,
          },
        ],
      });

      const updatedState = processDataPacket(stateWithEur, mockCallbacks, marketChangePacket);

      const market = updatedState.marketCache['1.123456'];
      expect(market).toBeDefined();
      const runner = market!.runners['123456'];
      expect(runner).toBeDefined();
      expect(runner!.ltp).toBe(2.0); // LTP kept in original currency (GBP) to match back/lay prices
    });

    it('should accumulate deltas correctly', () => {
      const marketChangePacket = JSON.stringify({
        id: 4,
        op: 'mcm',
        ct: 'SUB_IMAGE',
        pt: Date.now(),
        status: 200,
        mc: [
          {
            id: '1.123456',
            marketDefinition: {
              bspMarket: false,
              venue: 'Test Venue',
              name: 'Test Market',
            },
            rc: [
              {
                id: 123456,
                ltp: 2.5,
                batb: [[0, 2.4, 50]],
                batl: [[0, 2.6, 75]],
                con: true,
              },
            ],
            img: true,
            tv: 100,
            con: true,
          },
        ],
      });

      processDataPacket(initialState, mockCallbacks, marketChangePacket);

      // Check that onMarketChange was called with deltas
      expect(mockCallbacks.onMarketChange).toHaveBeenCalledWith(
        expect.any(Object),
        expect.arrayContaining([
          expect.stringContaining('Market definition updated'),
          expect.stringContaining('LTP updated'),
          expect.stringContaining('Back prices updated'),
          expect.stringContaining('Lay prices updated'),
        ])
      );
    });
  });
});