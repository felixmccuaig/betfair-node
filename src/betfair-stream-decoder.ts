import {
  ConnectionMessage,
  CurrencyRate,
  MarketCache,
  MarketChange,
  MarketChangeMessage,
  Message,
  RunnerCache,
  RunnerChange,
  StatusMessage,
  ChangeType,
  SegmentType,
  MarketDefinition,
  StreamRunnerStatus,
  OrderChangeMessage,
  OrderAccountChange,
  OrderAccountCache,
  OrderRunnerCache,
  OrderRunnerChange,
  UnmatchedOrder,
  StrategyMatchChange,
} from './betfair-exchange-stream-api-types';
import { safeJsonParse } from './utils';

// Stream decoder state
export interface StreamDecoderState {
  marketCache: { [key: string]: MarketCache };
  orderCache: { [key: string]: OrderAccountCache };
  currencyRate: CurrencyRate;
  deltas: string[];
  orderDeltas: string[];
  subscribedMarkets: string[];
  // Segmentation handling
  segmentBuffer: {
    marketSegments: { [requestId: string]: Partial<MarketChangeMessage>[] };
    orderSegments: { [requestId: string]: Partial<OrderChangeMessage>[] };
  };
}

export interface StreamDecoderCallbacks {
  onMarketChange: (marketCache: { [key: string]: MarketCache }, deltas: string[]) => void;
  onOrderChange?: (orderCache: { [key: string]: OrderAccountCache }, deltas: string[]) => void;
  onStatus: (statusMessage: StatusMessage) => void;
  onConnection: (connectionMessage: ConnectionMessage) => void;
  onHeartbeat: () => void;
}

/**
 * Creates initial stream decoder state
 */
export const createStreamDecoderState = (
  currencyRate: CurrencyRate,
  subscribedMarkets: string[] = []
): StreamDecoderState => ({
  marketCache: {},
  orderCache: {},
  currencyRate,
  deltas: [],
  orderDeltas: [],
  subscribedMarkets,
  segmentBuffer: {
    marketSegments: {},
    orderSegments: {},
  },
});

/**
 * Processes received data packet
 */
export const processDataPacket = (
  state: StreamDecoderState,
  callbacks: StreamDecoderCallbacks,
  packet: string
): StreamDecoderState => {
  const message = safeJsonParse<Message>(packet);
  if (!message) {
    console.error('Failed to parse packet:', packet);
    return state;
  }

  return decodeMessage(state, callbacks, message);
};

/**
 * Decodes a message based on its operation type
 */
const decodeMessage = (
  state: StreamDecoderState,
  callbacks: StreamDecoderCallbacks,
  message: Message
): StreamDecoderState => {
  switch (message.op) {
    case 'connection':
      callbacks.onConnection(message as ConnectionMessage);
      return state;
    
    case 'status':
      callbacks.onStatus(message as StatusMessage);
      return state;
    
    case 'mcm':
      return handleSegmentedMarketMessage(state, callbacks, message as MarketChangeMessage);
    
    case 'ocm':
      return handleSegmentedOrderMessage(state, callbacks, message as OrderChangeMessage);
    
    default:
      console.warn('Unknown message type:', message.op);
      return state;
  }
};

/**
 * Handles segmented market messages - only processes complete messages
 */
const handleSegmentedMarketMessage = (
  state: StreamDecoderState,
  callbacks: StreamDecoderCallbacks,
  message: MarketChangeMessage
): StreamDecoderState => {
  const requestId = message.id?.toString() || 'default';
  const segmentType = message.segmentationType;

  console.log(`🧩 Market message segment: requestId=${requestId}, segmentType=${segmentType || 'NONE'}, changeType=${message.ct}`);

  // Handle non-segmented messages immediately (only if no segments are buffered for this request)
  if (!segmentType && !state.segmentBuffer.marketSegments[requestId]) {
    console.log('📦 Processing complete (non-segmented) market message');
    return decodeMarketChangeMessage(state, callbacks, message);
  }

  let updatedState = { ...state };
  let updatedSegmentBuffer = { ...state.segmentBuffer };

  // Handle segment start - clear any existing segments for this request
  if (segmentType === SegmentType.SEG_START) {
    console.log('🟢 Starting new market message segment collection');
    updatedSegmentBuffer.marketSegments[requestId] = [message];
    updatedState.segmentBuffer = updatedSegmentBuffer;
    return updatedState;
  }

  // Handle segment end - reassemble and process complete message
  if (segmentType === SegmentType.SEG_END) {
    console.log('🔴 Ending market message segment collection - reassembling');
    const segments = updatedSegmentBuffer.marketSegments[requestId] || [];
    segments.push(message);
    
    // Reassemble complete message
    const completeMessage = reassembleMarketMessage(segments);
    
    // Clean up segment buffer
    delete updatedSegmentBuffer.marketSegments[requestId];
    updatedState.segmentBuffer = updatedSegmentBuffer;
    
    console.log('✅ Processing reassembled complete market message');
    return decodeMarketChangeMessage(updatedState, callbacks, completeMessage);
  }

  // Handle middle segments (including undefined segmentType when already collecting) - just collect them
  console.log('🟡 Collecting middle market message segment');
  const existingSegments = updatedSegmentBuffer.marketSegments[requestId] || [];
  existingSegments.push(message);
  updatedSegmentBuffer.marketSegments[requestId] = existingSegments;
  updatedState.segmentBuffer = updatedSegmentBuffer;
  
  return updatedState;
};

/**
 * Handles segmented order messages - only processes complete messages
 */
const handleSegmentedOrderMessage = (
  state: StreamDecoderState,
  callbacks: StreamDecoderCallbacks,
  message: OrderChangeMessage
): StreamDecoderState => {
  const requestId = message.id?.toString() || 'default';
  const segmentType = message.segmentationType;

  console.log(`🧩 Order message segment: requestId=${requestId}, segmentType=${segmentType || 'NONE'}, changeType=${message.ct}`);

  // Handle non-segmented messages immediately (only if no segments are buffered for this request)
  if (!segmentType && !state.segmentBuffer.orderSegments[requestId]) {
    console.log('📦 Processing complete (non-segmented) order message');
    return decodeOrderChangeMessage(state, callbacks, message);
  }

  let updatedState = { ...state };
  let updatedSegmentBuffer = { ...state.segmentBuffer };

  // Handle segment start - clear any existing segments for this request
  if (segmentType === SegmentType.SEG_START) {
    console.log('🟢 Starting new order message segment collection');
    updatedSegmentBuffer.orderSegments[requestId] = [message];
    updatedState.segmentBuffer = updatedSegmentBuffer;
    return updatedState;
  }

  // Handle segment end - reassemble and process complete message
  if (segmentType === SegmentType.SEG_END) {
    console.log('🔴 Ending order message segment collection - reassembling');
    const segments = updatedSegmentBuffer.orderSegments[requestId] || [];
    segments.push(message);
    
    // Reassemble complete message
    const completeMessage = reassembleOrderMessage(segments);
    
    // Clean up segment buffer
    delete updatedSegmentBuffer.orderSegments[requestId];
    updatedState.segmentBuffer = updatedSegmentBuffer;
    
    console.log('✅ Processing reassembled complete order message');
    return decodeOrderChangeMessage(updatedState, callbacks, completeMessage);
  }

  // Handle middle segments (including undefined segmentType when already collecting) - just collect them
  console.log('🟡 Collecting middle order message segment');
  const existingSegments = updatedSegmentBuffer.orderSegments[requestId] || [];
  existingSegments.push(message);
  updatedSegmentBuffer.orderSegments[requestId] = existingSegments;
  updatedState.segmentBuffer = updatedSegmentBuffer;
  
  return updatedState;
};

/**
 * Reassembles segmented market messages into a complete message
 */
const reassembleMarketMessage = (segments: Partial<MarketChangeMessage>[]): MarketChangeMessage => {
  if (segments.length === 0) {
    throw new Error('Cannot reassemble empty market message segments');
  }

  const firstSegment = segments[0]!;
  const lastSegment = segments[segments.length - 1]!;

  // Merge all market changes from all segments
  const allMarketChanges: MarketChange[] = [];
  for (const segment of segments) {
    if (segment.mc) {
      allMarketChanges.push(...segment.mc);
    }
  }

  console.log(`🔧 Reassembled ${segments.length} market segments into ${allMarketChanges.length} market changes`);

  // Create complete message with merged data
  const completeMessage: MarketChangeMessage = {
    op: firstSegment.op!,
    id: firstSegment.id!,
    ct: firstSegment.ct!,
    pt: lastSegment.pt || firstSegment.pt!,
    status: lastSegment.status || firstSegment.status!,
    con: lastSegment.con !== undefined ? lastSegment.con : firstSegment.con!,
    segmentationType: lastSegment.segmentationType || firstSegment.segmentationType!,
    segmentationEnabled: firstSegment.segmentationEnabled!,
    conflateMs: firstSegment.conflateMs!,
    heartbeatMs: firstSegment.heartbeatMs!,
    initialClk: firstSegment.initialClk!,
    clk: lastSegment.clk || firstSegment.clk!,
    mc: allMarketChanges,
  };

  return completeMessage;
};

/**
 * Reassembles segmented order messages into a complete message
 */
const reassembleOrderMessage = (segments: Partial<OrderChangeMessage>[]): OrderChangeMessage => {
  if (segments.length === 0) {
    throw new Error('Cannot reassemble empty order message segments');
  }

  const firstSegment = segments[0]!;
  const lastSegment = segments[segments.length - 1]!;

  // Merge all order changes from all segments
  const allOrderChanges: OrderAccountChange[] = [];
  for (const segment of segments) {
    if (segment.oc) {
      allOrderChanges.push(...segment.oc);
    }
  }

  console.log(`🔧 Reassembled ${segments.length} order segments into ${allOrderChanges.length} order changes`);

  // Create complete message with merged data
  const completeMessage: OrderChangeMessage = {
    op: firstSegment.op!,
    id: firstSegment.id!,
    ct: firstSegment.ct!,
    pt: lastSegment.pt || firstSegment.pt!,
    status: lastSegment.status || firstSegment.status!,
    con: lastSegment.con !== undefined ? lastSegment.con : firstSegment.con!,
    segmentationType: lastSegment.segmentationType || firstSegment.segmentationType!,
    segmentationEnabled: firstSegment.segmentationEnabled!,
    conflateMs: firstSegment.conflateMs!,
    heartbeatMs: firstSegment.heartbeatMs!,
    initialClk: firstSegment.initialClk!,
    clk: lastSegment.clk || firstSegment.clk!,
    oc: allOrderChanges,
  };

  return completeMessage;
};

/**
 * Decodes market change messages
 */
const decodeMarketChangeMessage = (
  state: StreamDecoderState,
  callbacks: StreamDecoderCallbacks,
  message: MarketChangeMessage
): StreamDecoderState => {
  if (message.ct === ChangeType.HEARTBEAT) {
    callbacks.onHeartbeat();
    return state;
  }

  const updatedState = processSubImage(state, message);
  callbacks.onMarketChange(updatedState.marketCache, updatedState.deltas);
  
  // Clear deltas after callback
  return {
    ...updatedState,
    deltas: [],
  };
};

/**
 * Decodes order change messages
 */
const decodeOrderChangeMessage = (
  state: StreamDecoderState,
  callbacks: StreamDecoderCallbacks,
  message: OrderChangeMessage
): StreamDecoderState => {
  if (message.ct === ChangeType.HEARTBEAT) {
    callbacks.onHeartbeat();
    return state;
  }

  console.log('🔍 Raw order change message received:', {
    changeType: message.ct,
    segmentationType: message.segmentationType,
    publishTime: message.pt,
    connectionFlag: message.con,
    initialClk: message.initialClk,
    clk: message.clk,
    status: message.status,
    orderChangesCount: message.oc?.length || 0,
    orderChanges: message.oc?.map(oc => ({
      marketId: oc.id,
      closed: oc.closed,
      fullImage: oc.fullImage,
      runnerChangesCount: oc.orc?.length || 0,
      runnerChanges: oc.orc?.map(orc => ({
        runnerId: orc.id,
        fullImage: orc.fullImage,
        unmatchedOrdersCount: orc.uo?.length || 0,
        matchedBacksCount: orc.mb?.length || 0,
        matchedLaysCount: orc.ml?.length || 0
      }))
    }))
  });

  const updatedState = processOrderSubImage(state, message);
  
  if (callbacks.onOrderChange) {
    callbacks.onOrderChange(updatedState.orderCache, updatedState.orderDeltas);
  }
  
  // Clear order deltas after callback
  return {
    ...updatedState,
    orderDeltas: [],
  };
};

/**
 * Processes order subscription image data
 */
const processOrderSubImage = (
  state: StreamDecoderState,
  message: OrderChangeMessage
): StreamDecoderState => {
  if (!message.oc || message.oc.length === 0) {
    return state;
  }

  let updatedOrderCache = { ...state.orderCache };
  const newOrderDeltas = [...state.orderDeltas];

  for (const orderAccountChange of message.oc) {
    const result = processOrderAccountChange(updatedOrderCache, orderAccountChange);
    updatedOrderCache = result.cache;
    newOrderDeltas.push(...result.deltas);
  }

  return {
    ...state,
    orderCache: updatedOrderCache,
    orderDeltas: newOrderDeltas,
  };
};

/**
 * Processes subscription image data
 */
const processSubImage = (
  state: StreamDecoderState,
  message: MarketChangeMessage
): StreamDecoderState => {
  if (!message.mc || message.mc.length === 0) {
    return state;
  }

  let updatedCache = { ...state.marketCache };
  const newDeltas = [...state.deltas];

  for (const marketChange of message.mc) {
    const result = processMarketChange(updatedCache, marketChange, state.currencyRate);
    updatedCache = result.cache;
    newDeltas.push(...result.deltas);
  }

  return {
    ...state,
    marketCache: updatedCache,
    deltas: newDeltas,
  };
};

/**
 * Processes individual market changes
 */
const processMarketChange = (
  marketCache: { [key: string]: MarketCache },
  marketChange: MarketChange,
  currencyRate: CurrencyRate
): { cache: { [key: string]: MarketCache }; deltas: string[] } => {
  const marketId = marketChange.id;
  const deltas: string[] = [];

  // Initialize market cache if it doesn't exist
  if (!marketCache[marketId]) {
    marketCache[marketId] = createEmptyMarketCache(marketId);
  }

  let market = marketCache[marketId];

  // Update market definition if present
  if (marketChange.marketDefinition) {
    market = {
      ...market,
      marketDefinition: marketChange.marketDefinition,
    };
    deltas.push(`Market definition updated for ${marketId}`);
    
    // Extract runner status updates from market definition
    if (marketChange.marketDefinition.runners) {
      const statusUpdates: string[] = [];
      const updatedRunners = { ...market.runners };
      
      for (const runnerDef of marketChange.marketDefinition.runners) {
        const selectionId = runnerDef.id.toString();
        
        if (updatedRunners[selectionId] && runnerDef.status) {
          const oldStatus = updatedRunners[selectionId].status;
          updatedRunners[selectionId] = {
            ...updatedRunners[selectionId],
            status: runnerDef.status,
          };
          
          if (oldStatus !== runnerDef.status) {
            statusUpdates.push(`Runner ${selectionId} status: ${oldStatus} → ${runnerDef.status}`);
          }
        }
      }
      
      if (statusUpdates.length > 0) {
        market = { ...market, runners: updatedRunners };
        deltas.push(...statusUpdates);
      }
    }
  }

  // Process runner changes
  if (marketChange.rc) {
    const result = processRunnerChanges(market, marketChange.rc, currencyRate);
    market = result.market;
    deltas.push(...result.deltas);
  }

  // Update total matched and last value traded
  if (marketChange.tv !== undefined) {
    market = {
      ...market,
      totalMatched: marketChange.tv,
    };
  }

  return {
    cache: {
      ...marketCache,
      [marketId]: market,
    },
    deltas,
  };
};

/**
 * Processes runner changes within a market
 */
const processRunnerChanges = (
  market: MarketCache,
  runnerChanges: RunnerChange[],
  currencyRate: CurrencyRate
): { market: MarketCache; deltas: string[] } => {
  const deltas: string[] = [];
  const updatedRunners = { ...market.runners };

  for (const runnerChange of runnerChanges) {
    const selectionId = runnerChange.id.toString();
    
    if (!updatedRunners[selectionId]) {
      updatedRunners[selectionId] = createEmptyRunnerCache(runnerChange.id);
    }

    let runner = updatedRunners[selectionId];

    // Update runner properties
    if (runnerChange.ltp !== undefined) {
      runner = { ...runner, ltp: runnerChange.ltp }; // Keep LTP in original currency (GBP) to match back/lay prices
      deltas.push(`LTP updated for runner ${selectionId}: ${runner.ltp}`);
    }

    if (runnerChange.tv !== undefined) {
      // Don't overwrite existing volume with zero during settlement
      if (runnerChange.tv > 0 || runner.tv === 0) {
        runner = { ...runner, tv: runnerChange.tv };
        // console.log(`📊 Runner ${selectionId} TV updated to: ${runnerChange.tv}`);
      } else {
        // console.log(`🚫 Ignoring zero TV update for runner ${selectionId} (preserving ${runner.tv})`);
      }
    }

    if (runnerChange.batb) {
      runner = { ...runner, batb: runnerChange.batb };
      deltas.push(`Back prices updated for runner ${selectionId}`);
    }

    if (runnerChange.batl) {
      runner = { ...runner, batl: runnerChange.batl };
      deltas.push(`Lay prices updated for runner ${selectionId}`);
    }

    if (runnerChange.atb) {
      runner = { ...runner, atb: runnerChange.atb };
    }

    if (runnerChange.atl) {
      runner = { ...runner, atl: runnerChange.atl };
    }

    // BSP (Betfair Starting Price) fields
    if (runnerChange.spn !== undefined) {
      runner = { ...runner, spn: runnerChange.spn };
    }

    if (runnerChange.spf !== undefined) {
      runner = { ...runner, spf: runnerChange.spf };
    }

    if (runnerChange.spb) {
      runner = { ...runner, spb: runnerChange.spb };
      deltas.push(`BSP back prices updated for runner ${selectionId}`);
    }

    if (runnerChange.spl) {
      runner = { ...runner, spl: runnerChange.spl };
      deltas.push(`BSP lay prices updated for runner ${selectionId}`);
    }

    // Trading data
    if (runnerChange.trd) {
      const totalTraded = runnerChange.trd.reduce((sum, [price, volume]) => sum + volume, 0);
      
      // Don't overwrite existing trading data with empty/zero data during settlement
      if (totalTraded > 0 || !runner.trd || runner.trd.length === 0) {
        runner = { ...runner, trd: runnerChange.trd };
        deltas.push(`Trading data updated for runner ${selectionId}: ${runnerChange.trd.length} trades, total volume: ${totalTraded}`);
        // console.log(`🔄 Trading data for runner ${selectionId}:`, runnerChange.trd, `total: ${totalTraded}`);
      } else {
        // console.log(`🚫 Ignoring zero trading data update for runner ${selectionId} (preserving existing data)`);
      }
    }

    updatedRunners[selectionId] = runner;
  }

  return {
    market: {
      ...market,
      runners: updatedRunners,
    },
    deltas,
  };
};

/**
 * Processes individual order account changes
 */
const processOrderAccountChange = (
  orderCache: { [key: string]: OrderAccountCache },
  orderAccountChange: OrderAccountChange
): { cache: { [key: string]: OrderAccountCache }; deltas: string[] } => {
  const marketId = orderAccountChange.id;
  const deltas: string[] = [];

  // Check for full image replacement
  if (orderAccountChange.fullImage) {
    if (!orderAccountChange.orc || orderAccountChange.orc.length === 0) {
      // Empty full image means remove this market from cache
      const updatedCache = { ...orderCache };
      delete updatedCache[marketId];
      deltas.push(`Order market ${marketId} removed from cache`);
      return { cache: updatedCache, deltas };
    }
  }

  // Initialize order cache if it doesn't exist
  if (!orderCache[marketId]) {
    orderCache[marketId] = createEmptyOrderAccountCache(marketId);
    deltas.push(`Order market ${marketId} initialized`);
  }

  let market = orderCache[marketId];

  // Update closed status
  if (orderAccountChange.closed !== undefined) {
    market = {
      ...market,
      closed: orderAccountChange.closed,
    };
    deltas.push(`Market ${marketId} closed status: ${orderAccountChange.closed}`);
  }

  // Process runner changes
  if (orderAccountChange.orc) {
    const result = processOrderRunnerChanges(market, orderAccountChange.orc, orderAccountChange.fullImage || false);
    market = result.market;
    deltas.push(...result.deltas);
  }

  return {
    cache: {
      ...orderCache,
      [marketId]: market,
    },
    deltas,
  };
};

/**
 * Processes order runner changes within a market
 */
const processOrderRunnerChanges = (
  market: OrderAccountCache,
  runnerChanges: OrderRunnerChange[],
  isFullImage: boolean
): { market: OrderAccountCache; deltas: string[] } => {
  const deltas: string[] = [];
  let updatedRunners = { ...market.runners };

  for (const runnerChange of runnerChanges) {
    const selectionId = runnerChange.id.toString();
    
    // Handle runner full image replacement
    if (runnerChange.fullImage || isFullImage) {
      updatedRunners[selectionId] = createEmptyOrderRunnerCache(runnerChange.id, runnerChange.hc);
      deltas.push(`Order runner ${selectionId} full image reset`);
    } else if (!updatedRunners[selectionId]) {
      updatedRunners[selectionId] = createEmptyOrderRunnerCache(runnerChange.id, runnerChange.hc);
      deltas.push(`Order runner ${selectionId} initialized`);
    }

    let runner = updatedRunners[selectionId];

    // Process unmatched orders (orders are sent in full on change)
    if (runnerChange.uo) {
      const orderUpdates: string[] = [];
      const updatedUnmatchedOrders: { [key: string]: UnmatchedOrder } = {};
      
      for (const order of runnerChange.uo) {
        updatedUnmatchedOrders[order.id] = order;
        
        if (runner.unmatchedOrders[order.id]) {
          orderUpdates.push(`Order ${order.id} updated: ${order.status}, matched: ${order.sm}/${order.s}`);
        } else {
          orderUpdates.push(`Order ${order.id} added: ${order.side} ${order.s}@${order.p}, status: ${order.status}`);
        }
      }
      
      runner = { ...runner, unmatchedOrders: updatedUnmatchedOrders };
      deltas.push(...orderUpdates);
    }

    // Process matched backs ladder (delta merge)
    if (runnerChange.mb) {
      const updatedMatchedBacks = mergeMatchedLadder(runner.matchedBacks, runnerChange.mb);
      runner = { ...runner, matchedBacks: updatedMatchedBacks };
      deltas.push(`Matched backs updated for runner ${selectionId}: ${runnerChange.mb.length} levels`);
    }

    // Process matched lays ladder (delta merge)
    if (runnerChange.ml) {
      const updatedMatchedLays = mergeMatchedLadder(runner.matchedLays, runnerChange.ml);
      runner = { ...runner, matchedLays: updatedMatchedLays };
      deltas.push(`Matched lays updated for runner ${selectionId}: ${runnerChange.ml.length} levels`);
    }

    // Process strategy match changes
    if (runnerChange.smc) {
      const updatedStrategyMatches = { ...runner.strategyMatches };
      
      for (const [strategyRef, strategyChange] of Object.entries(runnerChange.smc)) {
        if (!updatedStrategyMatches[strategyRef]) {
          updatedStrategyMatches[strategyRef] = { mb: [], ml: [] };
        }
        
        let strategyMatch = updatedStrategyMatches[strategyRef];
        
        if (strategyChange.mb) {
          strategyMatch = { ...strategyMatch, mb: mergeMatchedLadder(strategyMatch.mb || [], strategyChange.mb) };
        }
        
        if (strategyChange.ml) {
          strategyMatch = { ...strategyMatch, ml: mergeMatchedLadder(strategyMatch.ml || [], strategyChange.ml) };
        }
        
        updatedStrategyMatches[strategyRef] = strategyMatch;
        deltas.push(`Strategy ${strategyRef} matches updated for runner ${selectionId}`);
      }
      
      runner = { ...runner, strategyMatches: updatedStrategyMatches };
    }

    updatedRunners[selectionId] = runner;
  }

  return {
    market: {
      ...market,
      runners: updatedRunners,
    },
    deltas,
  };
};

/**
 * Merges matched ladder data using delta format
 */
const mergeMatchedLadder = (
  currentLadder: [number, number][],
  updates: [number, number][]
): [number, number][] => {
  const ladderMap = new Map<number, number>();
  
  // Add current ladder to map
  for (const [price, size] of currentLadder) {
    ladderMap.set(price, size);
  }
  
  // Apply updates
  for (const [price, size] of updates) {
    if (size === 0) {
      // Remove price level
      ladderMap.delete(price);
    } else {
      // Update price level
      ladderMap.set(price, size);
    }
  }
  
  // Convert back to array and sort by price
  return Array.from(ladderMap.entries()).sort((a, b) => a[0] - b[0]);
};

/**
 * Creates an empty order account cache entry
 */
const createEmptyOrderAccountCache = (marketId: string): OrderAccountCache => ({
  marketId,
  closed: false,
  runners: {},
  published: Date.now(),
});

/**
 * Creates an empty order runner cache entry
 */
const createEmptyOrderRunnerCache = (id: number, hc?: number): OrderRunnerCache => ({
  id,
  hc,
  unmatchedOrders: {},
  matchedBacks: [],
  matchedLays: [],
  strategyMatches: {},
});

/**
 * Creates an empty market cache entry
 */
const createEmptyMarketCache = (marketId: string): MarketCache => ({
  marketId,
  marketDefinition: {} as MarketDefinition,
  runners: {},
  totalMatched: 0,
  lastValueTraded: 0,
  published: Date.now(),
});

/**
 * Creates an empty runner cache entry
 */
const createEmptyRunnerCache = (id: number): RunnerCache => ({
  id,
  status: 'ACTIVE' as StreamRunnerStatus,
  adjustmentFactor: 0,
  lastPriceTraded: 0,
  totalMatched: 0,
  batb: [],
  batl: [],
  atb: [],
  atl: [],
  ltp: 0,
  tv: 0,
  // BSP fields
  spn: 0,
  spf: 0,
  spb: [],
  spl: [],
  // Trading data
  trd: [],
  fullImage: {},
});

/**
 * Converts price using currency rate
 */
const convertPrice = (price: number, currencyRate: CurrencyRate): number => {
  return price * currencyRate.rate;
};

/**
 * Clears the market cache
 */
export const clearMarketCache = (state: StreamDecoderState): StreamDecoderState => ({
  ...state,
  marketCache: {},
});

/**
 * Updates the currency rate
 */
export const updateCurrencyRate = (
  state: StreamDecoderState,
  currencyRate: CurrencyRate
): StreamDecoderState => ({
  ...state,
  currencyRate,
});

/**
 * Updates subscribed markets
 */
export const updateSubscribedMarkets = (
  state: StreamDecoderState,
  markets: string[]
): StreamDecoderState => ({
  ...state,
  subscribedMarkets: markets,
});

/**
 * Gets the current market cache
 */
export const getMarketCache = (state: StreamDecoderState): { [key: string]: MarketCache } => {
  return state.marketCache;
};

/**
 * Resets the stream decoder state
 */
export const resetStreamDecoder = (state: StreamDecoderState): StreamDecoderState => ({
  ...state,
  marketCache: {},
  orderCache: {},
  deltas: [],
  orderDeltas: [],
  segmentBuffer: {
    marketSegments: {},
    orderSegments: {},
  },
});

/**
 * Gets the current order cache
 */
export const getOrderCache = (state: StreamDecoderState): { [key: string]: OrderAccountCache } => {
  return state.orderCache;
};

/**
 * Clears the order cache
 */
export const clearOrderCache = (state: StreamDecoderState): StreamDecoderState => ({
  ...state,
  orderCache: {},
  orderDeltas: [],
  segmentBuffer: {
    ...state.segmentBuffer,
    orderSegments: {}, // Clear order segments but keep market segments
  },
});