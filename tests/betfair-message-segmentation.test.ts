import {
  createStreamDecoderState,
  processDataPacket,
  getMarketCache,
  getOrderCache,
} from '../src/betfair-stream-decoder';
import {
  MarketChangeMessage,
  OrderChangeMessage,
  ChangeType,
  SegmentType,
  StreamOrderStatus,
  StreamPersistenceType,
  StreamOrderType,
  OrderSide,
} from '../src/betfair-exchange-stream-api-types';

describe('Message Segmentation', () => {
  const mockCurrencyRate = { currencyCode: 'AUD', rate: 1.0 };
  
  const createMockCallbacks = () => ({
    onMarketChange: jest.fn(),
    onOrderChange: jest.fn(),
    onStatus: jest.fn(),
    onConnection: jest.fn(),
    onHeartbeat: jest.fn(),
  });

  // Base message structure for segmented messages
  const createBaseMarketMessage = (id: number): Partial<MarketChangeMessage> => ({
    op: 'mcm' as const,
    id,
    ct: ChangeType.SUB_IMAGE,
    pt: 1754190000000,
    status: 200,
    con: false,
    segmentationEnabled: true,
    conflateMs: 500,
    heartbeatMs: 5000,
    initialClk: 'initial123',
    clk: 'clk123',
  });

  const createBaseOrderMessage = (id: number): Partial<OrderChangeMessage> => ({
    op: 'ocm' as const,
    id,
    ct: ChangeType.SUB_IMAGE,
    pt: 1754190000000,
    status: 200,
    con: false,
    segmentationEnabled: true,
    conflateMs: 500,
    heartbeatMs: 5000,
    initialClk: 'order_initial123',
    clk: 'order_clk123',
  });

  beforeEach(() => {
    // Mock console methods to avoid cluttering test output
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Market Message Segmentation', () => {
    it('should handle segmented market messages (SEG_START, middle, SEG_END)', () => {
      const state = createStreamDecoderState(mockCurrencyRate);
      const callbacks = createMockCallbacks();

      // Segment 1: SEG_START
      const segment1: MarketChangeMessage = {
        ...createBaseMarketMessage(12345),
        segmentationType: SegmentType.SEG_START,
        mc: [
          {
            id: '1.123456789',
            rc: [
              {
                batb: [[1.5, 100, 0]], // [price, size, virtualSize]
                id: 111,
              },
            ],
            img: true,
          },
        ],
      } as MarketChangeMessage;

      // Segment 2: Middle segment (no segmentationType)
      const segment2: MarketChangeMessage = {
        ...createBaseMarketMessage(12345),
        segmentationType: undefined,
        mc: [
          {
            id: '1.987654321',
            rc: [
              {
                batb: [[2.0, 200, 0]],
                id: 222,
              },
            ],
            img: true,
          },
        ],
      } as MarketChangeMessage;

      // Segment 3: SEG_END
      const segment3: MarketChangeMessage = {
        ...createBaseMarketMessage(12345),
        segmentationType: SegmentType.SEG_END,
        pt: 1754190001000, // Updated timestamp
        clk: 'clk456', // Updated clock
        mc: [
          {
            id: '1.555666777',
            rc: [
              {
                batb: [[3.0, 300, 0]],
                id: 333,
              },
            ],
            img: true,
          },
        ],
      } as MarketChangeMessage;

      // Process segments
      let updatedState = processDataPacket(state, callbacks, JSON.stringify(segment1));
      
      // After SEG_START: should not call onMarketChange yet, should buffer segment
      expect(callbacks.onMarketChange).not.toHaveBeenCalled();
      expect(updatedState.segmentBuffer.marketSegments['12345']).toHaveLength(1);

      updatedState = processDataPacket(updatedState, callbacks, JSON.stringify(segment2));
      
      // After middle segment: still should not call onMarketChange, should buffer segment
      expect(callbacks.onMarketChange).not.toHaveBeenCalled();
      expect(updatedState.segmentBuffer.marketSegments['12345']).toHaveLength(2);

      updatedState = processDataPacket(updatedState, callbacks, JSON.stringify(segment3));
      
      // After SEG_END: should call onMarketChange with reassembled message and clear buffer
      expect(callbacks.onMarketChange).toHaveBeenCalledTimes(1);
      expect(updatedState.segmentBuffer.marketSegments['12345']).toBeUndefined();
      
      // Verify the market cache contains all three markets from the segments
      const marketCache = getMarketCache(updatedState);
      expect(marketCache['1.123456789']).toBeDefined();
      expect(marketCache['1.987654321']).toBeDefined();
      expect(marketCache['1.555666777']).toBeDefined();
    });

    it('should handle non-segmented market messages immediately', () => {
      const state = createStreamDecoderState(mockCurrencyRate);
      const callbacks = createMockCallbacks();

      const nonSegmentedMessage: MarketChangeMessage = {
        ...createBaseMarketMessage(54321),
        segmentationType: undefined, // Non-segmented
        mc: [
          {
            id: '1.111111111',
            rc: [
              {
                batb: [[1.8, 80, 0]],
                id: 444,
              },
            ],
            img: true,
          },
        ],
      } as MarketChangeMessage;

      const updatedState = processDataPacket(state, callbacks, JSON.stringify(nonSegmentedMessage));
      
      // Should call onMarketChange immediately for non-segmented messages
      expect(callbacks.onMarketChange).toHaveBeenCalledTimes(1);
      expect(updatedState.segmentBuffer.marketSegments).toEqual({});
      
      // Verify market was processed
      const marketCache = getMarketCache(updatedState);
      expect(marketCache['1.111111111']).toBeDefined();
    });
  });

  describe('Order Message Segmentation', () => {
    it('should handle segmented order messages (SEG_START, middle, SEG_END)', () => {
      const state = createStreamDecoderState(mockCurrencyRate);
      const callbacks = createMockCallbacks();

      // Segment 1: SEG_START
      const segment1: OrderChangeMessage = {
        ...createBaseOrderMessage(98765),
        segmentationType: SegmentType.SEG_START,
        oc: [
          {
            id: '1.123456789',
            orc: [
              {
                id: 111,
                uo: [
                  {
                    id: 'order1',
                    p: 1.5,
                    s: 100,
                    side: OrderSide.BACK,
                    status: StreamOrderStatus.EXECUTABLE,
                    pt: StreamPersistenceType.LAPSE,
                    ot: StreamOrderType.LIMIT,
                    pd: 1754190000000,
                    sm: 0,
                    sr: 100,
                    sl: 0,
                    sc: 0,
                    sv: 0,
                    ld: 0,
                    md: 0,
                    avp: 0,
                    rfs: 'strategy1',
                  },
                ],
              },
            ],
            fullImage: true,
          },
        ],
      } as OrderChangeMessage;

      // Segment 2: Middle segment
      const segment2: OrderChangeMessage = {
        ...createBaseOrderMessage(98765),
        segmentationType: undefined,
        oc: [
          {
            id: '1.987654321',
            orc: [
              {
                id: 222,
                uo: [
                  {
                    id: 'order2',
                    p: 2.0,
                    s: 200,
                    side: OrderSide.LAY,
                    status: StreamOrderStatus.EXECUTABLE,
                    pt: StreamPersistenceType.LAPSE,
                    ot: StreamOrderType.LIMIT,
                    pd: 1754190000000,
                    sm: 0,
                    sr: 200,
                    sl: 0,
                    sc: 0,
                    sv: 0,
                    ld: 0,
                    md: 0,
                    avp: 0,
                    rfs: 'strategy2',
                  },
                ],
              },
            ],
            fullImage: true,
          },
        ],
      } as OrderChangeMessage;

      // Segment 3: SEG_END
      const segment3: OrderChangeMessage = {
        ...createBaseOrderMessage(98765),
        segmentationType: SegmentType.SEG_END,
        pt: 1754190001000,
        clk: 'order_clk456',
        oc: [
          {
            id: '1.555666777',
            orc: [
              {
                id: 333,
                uo: [
                  {
                    id: 'order3',
                    p: 3.0,
                    s: 300,
                    side: OrderSide.BACK,
                    status: StreamOrderStatus.EXECUTABLE,
                    pt: StreamPersistenceType.PERSIST,
                    ot: StreamOrderType.LIMIT,
                    pd: 1754190000000,
                    sm: 0,
                    sr: 300,
                    sl: 0,
                    sc: 0,
                    sv: 0,
                    ld: 0,
                    md: 0,
                    avp: 0,
                    rfs: 'strategy3',
                  },
                ],
              },
            ],
            fullImage: true,
          },
        ],
      } as OrderChangeMessage;

      // Process segments
      let updatedState = processDataPacket(state, callbacks, JSON.stringify(segment1));
      
      // After SEG_START: should not call onOrderChange yet, should buffer segment
      expect(callbacks.onOrderChange).not.toHaveBeenCalled();
      expect(updatedState.segmentBuffer.orderSegments['98765']).toHaveLength(1);

      updatedState = processDataPacket(updatedState, callbacks, JSON.stringify(segment2));
      
      // After middle segment: still should not call onOrderChange, should buffer segment
      expect(callbacks.onOrderChange).not.toHaveBeenCalled();
      expect(updatedState.segmentBuffer.orderSegments['98765']).toHaveLength(2);

      updatedState = processDataPacket(updatedState, callbacks, JSON.stringify(segment3));
      
      // After SEG_END: should call onOrderChange with reassembled message and clear buffer
      expect(callbacks.onOrderChange).toHaveBeenCalledTimes(1);
      expect(updatedState.segmentBuffer.orderSegments['98765']).toBeUndefined();
      
      // Verify the order cache contains all three markets from the segments
      const orderCache = getOrderCache(updatedState);
      expect(orderCache['1.123456789']).toBeDefined();
      expect(orderCache['1.987654321']).toBeDefined();
      expect(orderCache['1.555666777']).toBeDefined();
      
      // Verify order data was processed correctly
      expect(orderCache['1.123456789']!.runners['111']!.unmatchedOrders['order1']).toBeDefined();
      expect(orderCache['1.987654321']!.runners['222']!.unmatchedOrders['order2']).toBeDefined();
      expect(orderCache['1.555666777']!.runners['333']!.unmatchedOrders['order3']).toBeDefined();
    });

    it('should handle non-segmented order messages immediately', () => {
      const state = createStreamDecoderState(mockCurrencyRate);
      const callbacks = createMockCallbacks();

      const nonSegmentedMessage: OrderChangeMessage = {
        ...createBaseOrderMessage(11111),
        segmentationType: undefined, // Non-segmented
        oc: [
          {
            id: '1.222333444',
            orc: [
              {
                id: 555,
                uo: [
                  {
                    id: 'order_nonseg',
                    p: 4.0,
                    s: 400,
                    side: OrderSide.LAY,
                    status: StreamOrderStatus.EXECUTABLE,
                    pt: StreamPersistenceType.LAPSE,
                    ot: StreamOrderType.LIMIT,
                    pd: 1754190000000,
                    sm: 0,
                    sr: 400,
                    sl: 0,
                    sc: 0,
                    sv: 0,
                    ld: 0,
                    md: 0,
                    avp: 0,
                    rfs: 'strategy_nonseg',
                  },
                ],
              },
            ],
            fullImage: true,
          },
        ],
      } as OrderChangeMessage;

      const updatedState = processDataPacket(state, callbacks, JSON.stringify(nonSegmentedMessage));
      
      // Should call onOrderChange immediately for non-segmented messages
      expect(callbacks.onOrderChange).toHaveBeenCalledTimes(1);
      expect(updatedState.segmentBuffer.orderSegments).toEqual({});
      
      // Verify order was processed
      const orderCache = getOrderCache(updatedState);
      expect(orderCache['1.222333444']).toBeDefined();
      expect(orderCache['1.222333444']!.runners['555']!.unmatchedOrders['order_nonseg']).toBeDefined();
    });
  });

  describe('Segmentation Edge Cases', () => {
    it('should handle heartbeat messages without segmentation', () => {
      const state = createStreamDecoderState(mockCurrencyRate);
      const callbacks = createMockCallbacks();

      const heartbeatMessage = {
        op: 'ocm',
        id: 99999,
        ct: ChangeType.HEARTBEAT,
        segmentationType: undefined,
      };

      const updatedState = processDataPacket(state, callbacks, JSON.stringify(heartbeatMessage));
      
      expect(callbacks.onHeartbeat).toHaveBeenCalledTimes(1);
      expect(callbacks.onOrderChange).not.toHaveBeenCalled();
      expect(updatedState.segmentBuffer.orderSegments).toEqual({});
    });

    it('should handle malformed segment data gracefully', () => {
      const state = createStreamDecoderState(mockCurrencyRate);
      const callbacks = createMockCallbacks();

      // Test with invalid JSON
      const updatedState = processDataPacket(state, callbacks, 'invalid json {');
      
      // Should not crash and should maintain state
      expect(updatedState).toEqual(state);
      expect(callbacks.onMarketChange).not.toHaveBeenCalled();
      expect(callbacks.onOrderChange).not.toHaveBeenCalled();
    });

    it('should handle single segment message flow (SEG_START then SEG_END)', () => {
      const state = createStreamDecoderState(mockCurrencyRate);
      const callbacks = createMockCallbacks();

      // Start segment
      const startSegment: MarketChangeMessage = {
        ...createBaseMarketMessage(77777),
        segmentationType: SegmentType.SEG_START,
        mc: [
          {
            id: '1.single123',
            rc: [
              {
                batb: [[5.0, 500, 0]],
                id: 999,
              },
            ],
            img: true,
          },
        ],
      } as MarketChangeMessage;

      // End segment immediately (no middle segments)
      const endSegment: MarketChangeMessage = {
        ...createBaseMarketMessage(77777),
        segmentationType: SegmentType.SEG_END,
        mc: [], // No additional data in end segment
      } as MarketChangeMessage;

      let updatedState = processDataPacket(state, callbacks, JSON.stringify(startSegment));
      expect(callbacks.onMarketChange).not.toHaveBeenCalled();
      expect(updatedState.segmentBuffer.marketSegments['77777']).toHaveLength(1);

      updatedState = processDataPacket(updatedState, callbacks, JSON.stringify(endSegment));
      expect(callbacks.onMarketChange).toHaveBeenCalledTimes(1);
      expect(updatedState.segmentBuffer.marketSegments['77777']).toBeUndefined();
      
      const marketCache = getMarketCache(updatedState);
      expect(marketCache['1.single123']).toBeDefined();
    });

    it('should handle multiple concurrent segmented message streams', () => {
      const state = createStreamDecoderState(mockCurrencyRate);
      const callbacks = createMockCallbacks();

      // Start two different segmented message streams
      const stream1Start: MarketChangeMessage = {
        ...createBaseMarketMessage(11111),
        segmentationType: SegmentType.SEG_START,
        mc: [{ id: '1.stream1', rc: [{ batb: [[1.0, 100, 0]], id: 1 }], img: true }],
      } as MarketChangeMessage;

      const stream2Start: OrderChangeMessage = {
        ...createBaseOrderMessage(22222),
        segmentationType: SegmentType.SEG_START,
        oc: [{ 
          id: '1.stream2', 
          orc: [{ 
            id: 2, 
            uo: [{ 
              id: 'order_stream2', p: 2.0, s: 200, side: OrderSide.BACK, 
              status: StreamOrderStatus.EXECUTABLE, pt: StreamPersistenceType.LAPSE, 
              ot: StreamOrderType.LIMIT, pd: Date.now(), sm: 0, sr: 200, sl: 0, 
              sc: 0, sv: 0, ld: 0, md: 0, avp: 0, rfs: 'test' 
            }] 
          }], 
          fullImage: true 
        }],
      } as OrderChangeMessage;

      let updatedState = processDataPacket(state, callbacks, JSON.stringify(stream1Start));
      updatedState = processDataPacket(updatedState, callbacks, JSON.stringify(stream2Start));

      // Both streams should be buffered separately
      expect(updatedState.segmentBuffer.marketSegments['11111']).toHaveLength(1);
      expect(updatedState.segmentBuffer.orderSegments['22222']).toHaveLength(1);
      expect(callbacks.onMarketChange).not.toHaveBeenCalled();
      expect(callbacks.onOrderChange).not.toHaveBeenCalled();

      // End both streams
      const stream1End: MarketChangeMessage = {
        ...createBaseMarketMessage(11111),
        segmentationType: SegmentType.SEG_END,
        mc: [],
      } as MarketChangeMessage;

      const stream2End: OrderChangeMessage = {
        ...createBaseOrderMessage(22222),
        segmentationType: SegmentType.SEG_END,
        oc: [],
      } as OrderChangeMessage;

      updatedState = processDataPacket(updatedState, callbacks, JSON.stringify(stream1End));
      updatedState = processDataPacket(updatedState, callbacks, JSON.stringify(stream2End));

      // Both callbacks should have been called once each
      expect(callbacks.onMarketChange).toHaveBeenCalledTimes(1);
      expect(callbacks.onOrderChange).toHaveBeenCalledTimes(1);
      
      // Both buffers should be cleared
      expect(updatedState.segmentBuffer.marketSegments['11111']).toBeUndefined();
      expect(updatedState.segmentBuffer.orderSegments['22222']).toBeUndefined();
    });
  });
});