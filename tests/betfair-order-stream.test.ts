import {
  StreamApiState,
  createStreamApiState,
  subscribeToOrders,
  getOrderStreamCache,
} from '../src/betfair-exchange-stream-api';

import {
  StreamDecoderState,
  StreamDecoderCallbacks,
  createStreamDecoderState,
  processDataPacket,
  getOrderCache,
  clearOrderCache,
  resetStreamDecoder,
} from '../src/betfair-stream-decoder';

import {
  CurrencyRate,
  OrderAccountCache,
  OrderChangeMessage,
  OrderFilter,
  OrderSide,
  StreamOrderStatus,
  StreamPersistenceType,
  StreamOrderType,
  ChangeType,
} from '../src/betfair-exchange-stream-api-types';

import * as fs from 'fs';
import * as path from 'path';

// Mock the TLS and readline modules
jest.mock('tls');
jest.mock('readline');

describe('Betfair Order Stream Functions', () => {
  let currencyRate: CurrencyRate;
  let mockMarketChangeCallback: jest.Mock;
  let mockOrderChangeCallback: jest.Mock;
  let initialState: StreamApiState;
  let decoderState: StreamDecoderState;
  let mockCallbacks: StreamDecoderCallbacks;

  beforeEach(() => {
    currencyRate = { currencyCode: 'AUD', rate: 1.0 };
    mockMarketChangeCallback = jest.fn();
    mockOrderChangeCallback = jest.fn((orderCache: { [key: string]: OrderAccountCache }, deltas: string[]) => {
      console.log('Order change:', Object.keys(orderCache), deltas);
    });

    initialState = createStreamApiState(
      'test-auth-token',
      'test-app-key',
      false, // segmentationEnabled
      500,   // conflateMs
      5000,  // heartbeatMs
      currencyRate,
      mockMarketChangeCallback,
      mockOrderChangeCallback
    );

    decoderState = createStreamDecoderState(currencyRate);
    
    mockCallbacks = {
      onMarketChange: jest.fn(),
      onOrderChange: mockOrderChangeCallback,
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
    jest.clearAllMocks();
  });

  describe('Order Stream API State', () => {
    it('should create initial stream API state with order callback', () => {
      expect(initialState.orderChangeCallback).toBe(mockOrderChangeCallback);
      expect(initialState.lastOrderSubscription).toBeUndefined();
      expect(initialState.streamDecoder.orderCache).toEqual({});
    });

    it('should support order subscription without filter', () => {
      // Mock socket and authentication
      const mockSocket = { write: jest.fn() };
      const updatedState = {
        ...initialState,
        tlsSocket: mockSocket as any,
        authenticationStatus: true,
      };

      const result = subscribeToOrders(updatedState);
      
      expect(result.lastOrderSubscription).toBeDefined();
      expect(result.lastOrderSubscription?.op).toBe('orderSubscription');
      expect(result.lastOrderSubscription?.orderFilter).toBeUndefined();
      expect(mockSocket.write).toHaveBeenCalled();
    });

    it('should support order subscription with filter', () => {
      const orderFilter: OrderFilter = {
        includeOverallPosition: false,
        customerStrategyRefs: ['strategy1', 'strategy2'],
        partitionMatchedByStrategyRef: true,
      };

      // Mock socket and authentication
      const mockSocket = { write: jest.fn() };
      const updatedState = {
        ...initialState,
        tlsSocket: mockSocket as any,
        authenticationStatus: true,
      };

      const result = subscribeToOrders(updatedState, orderFilter);
      
      expect(result.lastOrderSubscription?.orderFilter).toEqual(orderFilter);
      expect(mockSocket.write).toHaveBeenCalled();
      
      const writtenData = mockSocket.write.mock.calls[0][0];
      expect(writtenData).toContain('orderSubscription');
      expect(writtenData).toContain('partitionMatchedByStrategyRef');
    });

    it('should throw error when subscribing without connection', () => {
      expect(() => subscribeToOrders(initialState)).toThrow('Stream not connected or authenticated');
    });

    it('should get empty order cache initially', () => {
      const cache = getOrderStreamCache(initialState);
      expect(cache).toEqual({});
    });
  });

  describe('Order Stream Decoder', () => {
    it('should create initial decoder state with order cache', () => {
      expect(decoderState.orderCache).toEqual({});
      expect(decoderState.orderDeltas).toEqual([]);
    });

    it('should clear order cache', () => {
      // Add some fake data
      decoderState.orderCache['1.123'] = {
        marketId: '1.123',
        closed: false,
        runners: {},
        published: Date.now(),
      };
      decoderState.orderDeltas = ['test delta'];

      const clearedState = clearOrderCache(decoderState);
      expect(clearedState.orderCache).toEqual({});
      expect(clearedState.orderDeltas).toEqual([]);
    });

    it('should reset decoder state including order cache', () => {
      // Add some fake data
      decoderState.orderCache['1.123'] = {
        marketId: '1.123',
        closed: false,
        runners: {},
        published: Date.now(),
      };
      decoderState.orderDeltas = ['test delta'];
      decoderState.marketCache['1.123'] = {} as any;
      decoderState.deltas = ['market delta'];

      const resetState = resetStreamDecoder(decoderState);
      expect(resetState.orderCache).toEqual({});
      expect(resetState.orderDeltas).toEqual([]);
      expect(resetState.marketCache).toEqual({});
      expect(resetState.deltas).toEqual([]);
    });

    it('should get order cache', () => {
      const testCache = {
        '1.123': {
          marketId: '1.123',
          closed: false,
          runners: {},
          published: Date.now(),
        },
      };
      decoderState.orderCache = testCache;

      const cache = getOrderCache(decoderState);
      expect(cache).toBe(testCache);
    });
  });

  describe('Order Message Processing', () => {
    const testDataPath = path.join(__dirname, 'data', 'order-stream-test-data.json');
    let testMessages: string[];

    beforeAll(() => {
      const testData = fs.readFileSync(testDataPath, 'utf8');
      testMessages = testData.trim().split('\n');
    });

    it('should process initial order subscription image', () => {
      const initialMessage = testMessages[0];
      expect(initialMessage).toBeDefined();
      const updatedState = processDataPacket(decoderState, mockCallbacks, initialMessage!);

      expect(mockOrderChangeCallback).toHaveBeenCalled();
      expect(updatedState.orderCache['1.123456789']).toBeDefined();
      
      const market = updatedState.orderCache['1.123456789'];
      expect(market).toBeDefined();
      expect(market!.marketId).toBe('1.123456789');
      expect(market!.closed).toBe(false);
      expect(market!.runners['111']).toBeDefined();
      
      const runner = market!.runners['111'];
      expect(runner).toBeDefined();
      expect(runner!.id).toBe(111);
      expect(runner!.unmatchedOrders['12345678901']).toBeDefined();
      
      const order = runner!.unmatchedOrders['12345678901'];
      expect(order).toBeDefined();
      expect(order!.id).toBe('12345678901');
      expect(order!.p).toBe(2.0);
      expect(order!.s).toBe(10);
      expect(order!.side).toBe(OrderSide.BACK);
      expect(order!.status).toBe(StreamOrderStatus.EXECUTABLE);
      expect(order!.pt).toBe(StreamPersistenceType.LAPSE);
      expect(order!.ot).toBe(StreamOrderType.LIMIT);
      expect(order!.sm).toBe(0);
      expect(order!.sr).toBe(10);
      expect(order!.rfs).toBe('strategy1');
    });

    it('should process order partial match', () => {
      let state = decoderState;
      
      // Process initial image
      expect(testMessages[0]).toBeDefined();
      state = processDataPacket(state, mockCallbacks, testMessages[0]!);
      
      // Process partial match
      jest.clearAllMocks();
      expect(testMessages[1]).toBeDefined();
      state = processDataPacket(state, mockCallbacks, testMessages[1]!);

      expect(mockOrderChangeCallback).toHaveBeenCalled();
      
      const market = state.orderCache['1.123456789'];
      expect(market).toBeDefined();
      const runner = market!.runners['111'];
      expect(runner).toBeDefined();
      const order = runner!.unmatchedOrders['12345678901'];
      expect(order).toBeDefined();
      expect(order!.sm).toBe(2.5); // Size matched
      expect(order!.sr).toBe(7.5); // Size remaining
      expect(order!.avp).toBe(2.0); // Average price matched
      expect(order!.status).toBe(StreamOrderStatus.EXECUTABLE); // Still executable
      
      // Check matched backs ladder
      const matchedBacks = runner!.matchedBacks;
      expect(matchedBacks).toEqual([[2.0, 2.5]]);
    });

    it('should process order full match (execution complete)', () => {
      let state = decoderState;
      
      // Process initial image and partial match
      expect(testMessages[0]).toBeDefined();
      state = processDataPacket(state, mockCallbacks, testMessages[0]!);
      expect(testMessages[1]).toBeDefined();
      state = processDataPacket(state, mockCallbacks, testMessages[1]!);
      
      // Process full match
      jest.clearAllMocks();
      expect(testMessages[2]).toBeDefined();
      state = processDataPacket(state, mockCallbacks, testMessages[2]!);

      const market = state.orderCache['1.123456789'];
      expect(market).toBeDefined();
      const runner = market!.runners['111'];
      expect(runner).toBeDefined();
      const order = runner!.unmatchedOrders['12345678901'];
      expect(order).toBeDefined();
      expect(order!.sm).toBe(10); // Fully matched
      expect(order!.sr).toBe(0);  // No size remaining
      expect(order!.status).toBe(StreamOrderStatus.EXECUTION_COMPLETE);
      expect(order!.md).toBeDefined(); // Matched date set
      
      // Check matched backs ladder updated
      const matchedBacks = runner!.matchedBacks;
      expect(matchedBacks).toEqual([[2.0, 10]]);
    });

    it('should process lay order on different runner', () => {
      let state = decoderState;
      
      // Process messages up to lay order
      for (let i = 0; i <= 3; i++) {
        expect(testMessages[i]).toBeDefined();
        state = processDataPacket(state, mockCallbacks, testMessages[i]!);
      }

      const market = state.orderCache['1.123456789'];
      expect(market).toBeDefined();
      expect(market!.runners['222']).toBeDefined();
      
      const runner = market!.runners['222'];
      expect(runner).toBeDefined();
      const order = runner!.unmatchedOrders['98765432101'];
      expect(order).toBeDefined();
      expect(order!.id).toBe('98765432101');
      expect(order!.side).toBe(OrderSide.LAY);
      expect(order!.p).toBe(3.5);
      expect(order!.s).toBe(5);
      expect(order!.pt).toBe(StreamPersistenceType.PERSIST);
      expect(order!.rfs).toBe('strategy2');
    });

    it('should process lay order partial match', () => {
      let state = decoderState;
      
      // Process messages up to lay order partial match
      for (let i = 0; i <= 4; i++) {
        expect(testMessages[i]).toBeDefined();
        state = processDataPacket(state, mockCallbacks, testMessages[i]!);
      }

      const market = state.orderCache['1.123456789'];
      expect(market).toBeDefined();
      const runner = market!.runners['222'];
      expect(runner).toBeDefined();
      const order = runner!.unmatchedOrders['98765432101'];
      expect(order).toBeDefined();
      expect(order!.sm).toBe(2); // Size matched
      expect(order!.sr).toBe(3); // Size remaining
      
      // Check matched lays ladder
      const matchedLays = runner!.matchedLays;
      expect(matchedLays).toEqual([[3.5, 2]]);
    });

    it('should process matched ladder delta updates (removal)', () => {
      let state = decoderState;
      
      // Process messages up to ladder removal
      for (let i = 0; i <= 5; i++) {
        expect(testMessages[i]).toBeDefined();
        state = processDataPacket(state, mockCallbacks, testMessages[i]!);
      }

      // Check that size 0 removes the price level
      const market = state.orderCache['1.123456789'];
      expect(market).toBeDefined();
      const runner = market!.runners['222'];
      expect(runner).toBeDefined();
      const matchedLays = runner!.matchedLays;
      expect(matchedLays).toEqual([]); // Price level removed
    });

    it('should process market closed status', () => {
      let state = decoderState;
      
      // Process messages up to market closed
      for (let i = 0; i <= 6; i++) {
        expect(testMessages[i]).toBeDefined();
        state = processDataPacket(state, mockCallbacks, testMessages[i]!);
      }

      const market = state.orderCache['1.123456789'];
      expect(market).toBeDefined();
      expect(market!.closed).toBe(true);
    });

    it('should process strategy match changes', () => {
      let state = decoderState;
      
      // Process messages with strategy match changes
      for (let i = 0; i <= 8; i++) {
        expect(testMessages[i]).toBeDefined();
        state = processDataPacket(state, mockCallbacks, testMessages[i]!);
      }

      const market = state.orderCache['1.987654321'];
      expect(market).toBeDefined();
      const runner = market!.runners['555'];
      expect(runner).toBeDefined();
      expect(runner!.strategyMatches['strategy1']).toBeDefined();
      
      const strategyMatch = runner!.strategyMatches['strategy1'];
      expect(strategyMatch).toBeDefined();
      expect(strategyMatch!.mb).toEqual([[1.5, 10]]);
      expect(strategyMatch!.ml).toEqual([]);
    });

    it('should process full image replacement (market removal)', () => {
      let state = decoderState;
      
      // Process all messages including final full image replacement
      testMessages.forEach(message => {
        state = processDataPacket(state, mockCallbacks, message);
      });

      // Last message is empty full image - market should be removed
      expect(state.orderCache['1.123456789']).toBeUndefined();
      expect(state.orderCache['1.987654321']).toBeDefined(); // Other market should remain
    });

    it('should handle heartbeat messages', () => {
      const heartbeatMessage: OrderChangeMessage = {
        id: 1,
        op: 'ocm',
        ct: ChangeType.HEARTBEAT,
        status: 200,
        pt: Date.now(),
        con: false,
        segmentationType: '',
        segmentationEnabled: false,
        conflateMs: 0,
        heartbeatMs: 5000,
        initialClk: '',
        clk: '',
      };

      const state = processDataPacket(decoderState, mockCallbacks, JSON.stringify(heartbeatMessage));
      
      expect(mockCallbacks.onHeartbeat).toHaveBeenCalled();
      expect(mockOrderChangeCallback).not.toHaveBeenCalled();
      expect(state.orderCache).toEqual({});
    });

    it('should handle malformed JSON gracefully', () => {
      const malformedJson = '{"op":"ocm","malformed';
      
      const state = processDataPacket(decoderState, mockCallbacks, malformedJson);
      
      expect(state).toBe(decoderState); // State unchanged
      expect(mockOrderChangeCallback).not.toHaveBeenCalled();
    });

    it('should preserve order changes deltas', () => {
      const initialMessage = testMessages[0];
      expect(initialMessage).toBeDefined();
      processDataPacket(decoderState, mockCallbacks, initialMessage!);

      expect(mockOrderChangeCallback).toHaveBeenCalled();
      const [, deltas] = mockOrderChangeCallback.mock.calls[0];
      
      expect(deltas).toContain('Order market 1.123456789 initialized');
      expect(deltas).toContain('Order runner 111 full image reset');
      expect(deltas.some((delta: string) => delta.includes('Order 12345678901 added'))).toBe(true);
    });
  });

  describe('Order Cache Management', () => {
    let testMessages: string[];

    beforeAll(() => {
      const testDataPath = path.join(__dirname, 'data', 'order-stream-test-data.json');
      const testData = fs.readFileSync(testDataPath, 'utf8');
      testMessages = testData.trim().split('\n');
    });

    it('should properly merge matched ladder updates', () => {
      let state = decoderState;
      
      // Process initial and first update
      expect(testMessages[0]).toBeDefined();
      state = processDataPacket(state, mockCallbacks, testMessages[0]!);
      expect(testMessages[1]).toBeDefined();
      state = processDataPacket(state, mockCallbacks, testMessages[1]!);
      
      const market1 = state.orderCache['1.123456789'];
      expect(market1).toBeDefined();
      const runner1 = market1!.runners['111'];
      expect(runner1).toBeDefined();
      const initialBacks = runner1!.matchedBacks;
      expect(initialBacks).toEqual([[2.0, 2.5]]);
      
      // Process second update (should merge)
      expect(testMessages[2]).toBeDefined();
      state = processDataPacket(state, mockCallbacks, testMessages[2]!);
      
      const market2 = state.orderCache['1.123456789'];
      expect(market2).toBeDefined();
      const runner2 = market2!.runners['111'];
      expect(runner2).toBeDefined();
      const updatedBacks = runner2!.matchedBacks;
      expect(updatedBacks).toEqual([[2.0, 10]]); // Updated size at same price
    });

    it('should handle multiple price levels in ladder', () => {
      // Create a custom message with multiple price levels
      const multiLevelMessage = {
        op: 'ocm',
        clk: 'TEST',
        pt: Date.now(),
        oc: [{
          id: '1.123456789',
          orc: [{
            id: 111,
            mb: [[1.5, 5], [2.0, 10], [2.5, 15]],
            ml: [[3.0, 8], [3.5, 12]]
          }]
        }]
      };

      const state = processDataPacket(decoderState, mockCallbacks, JSON.stringify(multiLevelMessage));
      
      const market = state.orderCache['1.123456789'];
      expect(market).toBeDefined();
      const runner = market!.runners['111'];
      expect(runner).toBeDefined();
      expect(runner!.matchedBacks).toEqual([[1.5, 5], [2.0, 10], [2.5, 15]]);
      expect(runner!.matchedLays).toEqual([[3.0, 8], [3.5, 12]]);
    });

    it('should handle runner with handicap', () => {
      const handicapMessage = {
        op: 'ocm',
        clk: 'TEST',
        pt: Date.now(),
        oc: [{
          id: '1.123456789',
          orc: [{
            id: 111,
            hc: -1.5,
            uo: [{
              id: 'test123',
              p: 2.0,
              s: 10,
              side: 'B',
              status: 'E',
              pt: 'L',
              ot: 'L',
              pd: Date.now(),
              sm: 0,
              sr: 10,
              sl: 0,
              sc: 0,
              sv: 0,
              rfs: ''
            }]
          }]
        }]
      };

      const state = processDataPacket(decoderState, mockCallbacks, JSON.stringify(handicapMessage));
      
      const market = state.orderCache['1.123456789'];
      expect(market).toBeDefined();
      const runner = market!.runners['111'];
      expect(runner).toBeDefined();
      expect(runner!.hc).toBe(-1.5);
      expect(runner!.unmatchedOrders['test123']).toBeDefined();
    });
  });
});