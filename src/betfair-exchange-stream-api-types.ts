export type MarketChangeCallback = (
  marketCache: { [key: string]: MarketCache },
  deltas: string[]
) => void;

export type OrderChangeCallback = (
  orderCache: { [key: string]: OrderAccountCache },
  deltas: string[]
) => void;

export type RawDataCallback = (rawData: string) => void;

export type Message = {
  id: number;
  op: string;
};

export type CurrencyRate = {
  currencyCode: string;
  rate: number;
};

export type StatusMessage = Message & {
  statusCode: StatusCode;
  connectionClosed: boolean;
  errorCode: string;
  errorMessage: string;
  connectionsAvailable: number;
};

export type ConnectionMessage = Message & {
  connectionId: string;
};

export type AuthenticationMessage = Message & {
  appKey: string;
  session: string;
};

export type SubscriptionMessage = Message & {
  segmentationEnabled: boolean;
  conflateMs: number;
  heartbeatMs: number;
  initialClk: string;
  clk: string;
};

export type ChangeMessage = SubscriptionMessage & {
  ct: ChangeType;
  status: number;
  pt: number;
  con: boolean;
  segmentationType?: string; // Optional - undefined for non-segmented and middle segments
};

export type StreamMarketFilter = {
  marketIds?: string[];
  bspMarket?: boolean;
  bettingTypes?: BettingType[];
  eventTypeIds?: string[];
  eventIds?: string[];
  turnInPlayEnabled?: boolean;
  marketTypes?: string[];
  venues?: string[];
  countryCodes?: string[];
  raceTypes?: string[];
};

export type MarketDataFilter = Record<string, never>;

export type MarketChangeMessage = ChangeMessage & {
  mc: MarketChange[];
};

export type RunnerChange = {
  id: number; //Selection ID (always present)
  con?: boolean; //Conflated
  tv?: number; //Traded volume
  ltp?: number; //Last traded price
  spn?: number; //Starting price near
  spf?: number; //Starting price far
  batb?: [number, number, number][]; //Best available to back [level, price, size] array
  batl?: [number, number, number][]; //Best available to lay [level, price, size] array
  bdatb?: [number, number, number][]; //Best display available to back [level, price, size] array
  bdatl?: [number, number, number][]; //Best display available to back [level, price, size] array
  atb?: [number, number][]; //Available to back [price, size] array
  atl?: [number, number][]; //Available to lay [price, size] array
  spb?: [number, number][]; //Starting price back [price, size] array
  spl?: [number, number][]; //Starting price lay [price, size] array
  trd?: [number, number][]; //Traded [price, size] array
};

export type MarketDefinition = {
  venue: string;
  bspMarket: boolean;
  turnInPlayEnabled: boolean;
  persistenceEnabled: boolean;
  marketBaseRate: number;
  eventId: string;
  eventTypeId: string;
  numberOfWinners: number;
  bettingType: string;
  marketType: string;
  marketTime: string;
  suspendTime: string;
  bspReconciled: boolean;
  complete: boolean;
  inPlay: boolean;
  crossMatching: boolean;
  runnersVoidable: boolean;
  numberOfActiveRunners: number;
  betDelay: number;
  status: StreamMarketStatus;
  runners: RunnerDefinition[];
  regulators: string[];
  countryCode: string;
  discountAllowed: boolean;
  timezone: string;
  openDate: string;
  version: number;
  name: string;
  eventName: string;
  totalMatched: number;
};

export type RunnerDefinition = {
  status: StreamRunnerStatus;
  adjustmentFactor: number;
  lastPriceTraded: number;
  totalMatched: number;
  removalDate: string;
  id: number;
  hc: number;
  fullImage: { [key: string]: RunnerChange };
  bsp: number;
};

export type MarketChange = {
  id: string; //Market ID (always present)
  rc?: RunnerChange[]; //Runner changes
  img?: boolean; //Image - replace existing data
  tv?: number; //Total volume traded
  con?: boolean; //Conflated
  marketDefinition?: MarketDefinition; //Market definition
};

export type MarketCache = {
  marketId: string;
  marketDefinition: MarketDefinition;
  runners: { [key: string]: RunnerCache };
  totalMatched: number;
  lastValueTraded: number;
  published: number;
};

export type RunnerCache = {
  id: number;
  status: StreamRunnerStatus;
  adjustmentFactor: number;
  lastPriceTraded: number;
  totalMatched: number;
  batb: [number, number, number][];
  batl: [number, number, number][];
  atb: [number, number][];
  atl: [number, number][];
  ltp: number;
  tv: number;
  // BSP (Betfair Starting Price) fields
  spn: number; // Starting price near
  spf: number; // Starting price far
  spb: [number, number][]; // Starting price back [price, size] array
  spl: [number, number][]; // Starting price lay [price, size] array
  // Trading data
  trd: [number, number][]; // Traded [price, volume] array
  fullImage: { [key: string]: RunnerChange };
};

export type MarketSubscriptionMessage = Message & {
  marketFilter: StreamMarketFilter;
  segmentationEnabled: boolean;
  conflateMs: number;
  heartbeatMs: number;
};

// Order Subscription Types
export type OrderFilter = {
  accountIds?: number[];
  includeOverallPosition?: boolean;
  customerStrategyRefs?: string[];
  partitionMatchedByStrategyRef?: boolean;
};

export type OrderSubscriptionMessage = Message & {
  orderFilter?: OrderFilter;
  segmentationEnabled: boolean;
  conflateMs?: number;
  heartbeatMs?: number;
};

// Order Change Message Types
export type OrderChangeMessage = ChangeMessage & {
  oc?: OrderAccountChange[];
};

export type OrderAccountChange = {
  closed?: boolean;
  id: string; // Market ID
  fullImage?: boolean;
  orc?: OrderRunnerChange[];
};

export type OrderRunnerChange = {
  fullImage?: boolean;
  id: number; // Selection ID
  hc?: number; // Handicap
  uo?: UnmatchedOrder[]; // Unmatched Orders
  mb?: [number, number][]; // Matched Backs [price, size]
  ml?: [number, number][]; // Matched Lays [price, size]
  smc?: { [key: string]: StrategyMatchChange }; // Strategy Match Changes
};

export type UnmatchedOrder = {
  id: string; // Bet ID
  p: number; // Price
  s: number; // Size
  bsp?: number; // BSP Liability
  side: OrderSide;
  status: StreamOrderStatus;
  pt: StreamPersistenceType;
  ot: StreamOrderType;
  pd: number; // Placed Date
  md?: number; // Matched Date
  cd?: number; // Cancelled Date
  ld?: number; // Lapsed Date
  lsrc?: string; // Lapse Status Reason Code
  avp?: number; // Average Price Matched
  sm: number; // Size Matched
  sr: number; // Size Remaining
  sl: number; // Size Lapsed
  sc: number; // Size Cancelled
  sv: number; // Size Voided
  rac?: string; // Regulator Auth Code
  rc?: string; // Regulator Code
  rfo?: string; // Reference Order
  rfs?: string; // Reference Strategy
};

export type StrategyMatchChange = {
  mb?: [number, number][]; // Matched Backs [price, size]
  ml?: [number, number][]; // Matched Lays [price, size]
};

// Order Cache Types
export type OrderAccountCache = {
  marketId: string;
  closed: boolean;
  runners: { [key: string]: OrderRunnerCache };
  published: number;
};

export type OrderRunnerCache = {
  id: number;
  hc?: number;
  unmatchedOrders: { [key: string]: UnmatchedOrder };
  matchedBacks: [number, number][]; // [price, size]
  matchedLays: [number, number][]; // [price, size]
  strategyMatches: { [key: string]: StrategyMatchChange };
};

export enum StatusCode {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
}

export enum ChangeType {
  SUB_IMAGE = 'SUB_IMAGE',
  RESUB_DELTA = 'RESUB_DELTA',
  HEARTBEAT = 'HEARTBEAT',
}

export enum SegmentType {
  SEG_START = 'SEG_START',
  SEG_END = 'SEG_END',
  // null or undefined = not segmented or middle segment
}

export enum BettingType {
  ODDS = 'ODDS',
  LINE = 'LINE',
  RANGE = 'RANGE',
  ASIAN_HANDICAP_DOUBLE_LINE = 'ASIAN_HANDICAP_DOUBLE_LINE',
  ASIAN_HANDICAP_SINGLE_LINE = 'ASIAN_HANDICAP_SINGLE_LINE',
}

export enum StreamMarketStatus {
  INACTIVE = 'INACTIVE',
  OPEN = 'OPEN',
  SUSPENDED = 'SUSPENDED',
  CLOSED = 'CLOSED',
}

export enum StreamRunnerStatus {
  ACTIVE = 'ACTIVE',
  WINNER = 'WINNER',
  LOSER = 'LOSER',
  PLACED = 'PLACED',
  REMOVED_VACANT = 'REMOVED_VACANT',
  REMOVED = 'REMOVED',
  HIDDEN = 'HIDDEN',
}

// Order-related enums (Stream API specific - uses abbreviated codes)
export enum OrderSide {
  BACK = 'B',
  LAY = 'L',
}

export enum StreamOrderStatus {
  EXECUTABLE = 'E',
  EXECUTION_COMPLETE = 'EC',
}

export enum StreamPersistenceType {
  LAPSE = 'L',
  PERSIST = 'P',
  MARKET_ON_CLOSE = 'MOC',
}

export enum StreamOrderType {
  LIMIT = 'L',
  MARKET_ON_CLOSE = 'MOC',
  LIMIT_ON_CLOSE = 'LOC',
}