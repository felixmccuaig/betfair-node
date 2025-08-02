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
  MarketDefinition,
  StreamRunnerStatus,
} from './betfair-exchange-stream-api-types';
import { safeJsonParse } from './utils';

// Stream decoder state
export interface StreamDecoderState {
  marketCache: { [key: string]: MarketCache };
  currencyRate: CurrencyRate;
  deltas: string[];
  subscribedMarkets: string[];
}

export interface StreamDecoderCallbacks {
  onMarketChange: (marketCache: { [key: string]: MarketCache }, deltas: string[]) => void;
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
  currencyRate,
  deltas: [],
  subscribedMarkets,
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
      return decodeMarketChangeMessage(state, callbacks, message as MarketChangeMessage);
    
    default:
      console.warn('Unknown message type:', message.op);
      return state;
  }
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
      runner = { ...runner, tv: runnerChange.tv };
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
  deltas: [],
});