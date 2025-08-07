export type MarketFilter = {
  textQuery?: string;
  eventTypeIds?: string[];
  eventIds?: string[];
  competitionIds?: string[];
  marketIds?: string[];
  venues?: string[];
  bspOnly?: boolean;
  turnInPlayEnabled?: boolean;
  inPlayOnly?: boolean;
  marketBettingTypes?: MarketBettingType[];
  marketCountries?: string[];
  marketTypeCodes?: string[];
  marketStartTime?: MarketTimeRange;
  withOrders?: OrderStatus[];
  raceTypes?: string[];
};

export enum SortDir {
  EARLIEST_TO_LATEST = 'EARLIEST_TO_LATEST',
  LATEST_TO_EARLIEST = 'LATEST_TO_EARLIEST',
}

export enum BetStatus {
  SETTLED = 'SETTLED',
  VOIDED = 'VOIDED',
  LAPSED = 'LAPSED',
  CANCELLED = 'CANCELLED',
}

export type OrderSubscription = Record<string, never>;

export type MarketCatalogue = {
  marketId: string;
  marketName: string;
  marketStartTime?: string;
  description?: MarketDescription;
  totalMatched?: number;
  runners?: RunnerCatalogue[];
  eventType?: EventType;
  competition?: Competition;
  event?: Event;
};

export type RunnerCatalogue = {
  selectionId: number;
  runnerName: string;
  handicap: number;
  sortPriority: number;
  metadata: {
    [key: string]: string;
  };
};

export type EventType = {
  id: string;
  name: string;
};

export type PlaceInstruction = {
  orderType: OrderType;
  selectionId: number;
  handicap?: number;
  side: string;
  limitOrder?: LimitOrder;
  //limitOnCloseOrder?: LimitOnCloseOrder, //TODO: ADD THESE
  //marketOnCloseOrder?: MarketOnCloseOrder,
  customerOrderRef?: string;
};

export enum OrderType {
  LIMIT = 'LIMIT',
  LIMIT_ON_CLOSE = 'LIMIT_ON_CLOSE',
  MARKET_ON_CLOSE = 'MARKET_ON_CLOSE',
}

export type LimitOrder = {
  size: number;
  price: number;
  persistenceType: PersistenceType;
  timeInForce?: TimeInForce;
  minFillSize?: number;
  betTargetType?: string;
  betTargetSize?: string;
};

export enum PersistenceType {
  LAPSE = 'LAPSE',
  PERSIST = 'PERSIST',
  MARKET_ON_CLOSE = 'MARKET_ON_CLOSE',
}

export enum TimeInForce {
  FILL_OR_KILL = 'FILL_OR_KILL',
}

export type Competition = {
  id: string;
  name: string;
};

export type MarketDescription = {
  persistenceEnabled: boolean;
  bspMarket: boolean;
  marketTime: Date;
  suspendTime: Date;
  settleTime?: Date;
  bettingType: string;
  turnInPlayEnabled: boolean;
  marketType: string;
  regulator: string;
  marketBaseRate: number;
  discountAllowed: boolean;
  wallet?: string;
  rules?: string;
  rulesHasDate?: boolean;
  eachWayDivisor?: number;
  clarifications?: string;
  lineRangeInfo?: MarketLineRangeInfo;
  raceType?: string;
  priceLadderDescription?: PriceLadderDescription;
};

export type MarketLineRangeInfo = {
  maxUnitValue: number;
  minUnitValue: number;
  interval: number;
  marketUnit: string;
};

export type PriceLadderDescription = {
  type: PriceLadderType;
};

export enum PriceLadderType {
  CLASSIC = 'CLASSIC',
  FINEST = 'FINEST',
  LINE_RANGE = 'LINE_RANGE',
}

export type Event = {
  id: string;
  name: string;
  countryCode: string;
  timezone: string;
  venue: string;
  openDate: string;
};

export enum MarketBettingType {
  ODDS = 'ODDS',
  LINE = 'LINE',
  RANGE = 'RANGE',
  ASIAN_HANDICAP_DOUBLE_LINE = 'ASIAN_HANDICAP_DOUBLE_LINE',
  ASIAN_HANDICAP_SINGLE_LINE = 'ASIAN_HANDICAP_SINGLE_LINE',
  FIXED_ODDS = 'FIXED_ODDS',
}

export enum MarketSort {
  MINIMUM_TRADED = 'MINIMUM_TRADED',
  MAXIMUM_TRADED = 'MAXIMUM_TRADED',
  MINIMUM_AVAILABLE = 'MINIMUM_AVAILABLE',
  MAXIMUM_AVAILABLE = 'MAXIMUM_AVAILABLE',
  FIRST_TO_START = 'FIRST_TO_START',
  LAST_TO_START = 'LAST_TO_START',
}

export type MarketTimeRange = {
  from: string;
  to: string;
};

export enum OrderStatus {
  PENDING = 'PENDING',
  EXECUTION_COMPLETE = 'EXECUTION_COMPLETE',
  EXECUTABLE = 'EXECUTABLE',
  EXPIRED = 'EXPIRED',
}

export enum MarketProjection {
  COMPETITION = 'COMPETITION',
  EVENT = 'EVENT',
  EVENT_TYPE = 'EVENT_TYPE',
  MARKET_START_TIME = 'MARKET_START_TIME',
  MARKET_DESCRIPTION = 'MARKET_DESCRIPTION',
  RUNNER_DESCRIPTION = 'RUNNER_DESCRIPTION',
  RUNNER_METADATA = 'RUNNER_METADATA',
}

export enum PriceData {
  SP_AVAILABLE = 'SP_AVAILABLE',
  SP_TRADED = 'SP_TRADED',
  EX_BEST_OFFERS = 'EX_BEST_OFFERS',
  EX_ALL_OFFERS = 'EX_ALL_OFFERS',
  EX_TRADED = 'EX_TRADED',
}

export enum MatchProjection {
  NO_ROLLUP = 'NO_ROLLUP',
  ROLLED_UP_BY_PRICE = 'ROLLED_UP_BY_PRICE',
  ROLLED_UP_BY_AVG_PRICE = 'ROLLED_UP_BY_AVG_PRICE',
}

export enum OrderProjection {
  ALL = 'ALL',
  EXECUTABLE = 'EXECUTABLE',
  EXECUTION_COMPLETE = 'EXECUTION_COMPLETE',
}

export enum MarketStatus {
  INACTIVE = 'INACTIVE',
  OPEN = 'OPEN',
  SUSPENDED = 'SUSPENDED',
  CLOSED = 'CLOSED',
}

export enum RunnerStatus {
  ACTIVE = 'ACTIVE',
  WINNER = 'WINNER',
  LOSER = 'LOSER',
  PLACED = 'PLACED',
  REMOVED_VACANT = 'REMOVED_VACANT',
  REMOVED = 'REMOVED',
  HIDDEN = 'HIDDEN',
}

// Additional types for order management
export type TimeRange = {
  from?: string;
  to?: string;
};

export enum Side {
  BACK = 'BACK',
  LAY = 'LAY',
}

export enum OrderBy {
  BY_BET = 'BY_BET',
  BY_MARKET = 'BY_MARKET',
  BY_MATCH_TIME = 'BY_MATCH_TIME',
  BY_PLACED_TIME = 'BY_PLACED_TIME',
  BY_SETTLED_TIME = 'BY_SETTLED_TIME',
  BY_VOID_TIME = 'BY_VOID_TIME',
}

export enum GroupBy {
  EVENT_TYPE = 'EVENT_TYPE',
  EVENT = 'EVENT',
  MARKET = 'MARKET',
  SIDE = 'SIDE',
  BET = 'BET',
}

export type CancelInstruction = {
  betId: string;
  sizeReduction?: number;
};

export type ReplaceInstruction = {
  betId: string;
  newPrice: number;
};

export type UpdateInstruction = {
  betId: string;
  newPersistenceType: PersistenceType;
};

export type CurrentOrderSummary = {
  betId: string;
  marketId: string;
  selectionId: number;
  handicap: number;
  priceSize: PriceSize;
  bspLiability: number;
  side: Side;
  status: OrderStatus;
  persistenceType: PersistenceType;
  orderType: OrderType;
  placedDate: string;
  matchedDate?: string;
  averagePriceMatched?: number;
  sizeMatched?: number;
  sizeRemaining?: number;
  sizeLapsed?: number;
  sizeCancelled?: number;
  sizeVoided?: number;
  regulatorAuthCode?: string;
  regulatorCode?: string;
  customerOrderRef?: string;
  customerStrategyRef?: string;
};

export type ClearedOrderSummary = {
  eventTypeId?: string;
  eventId?: string;
  marketId?: string;
  selectionId?: number;
  handicap?: number;
  betId?: string;
  placedDate?: string;
  persistenceType?: PersistenceType;
  orderType?: OrderType;
  side?: Side;
  itemDescription?: ItemDescription;
  betOutcome?: string;
  priceRequested?: number;
  settledDate?: string;
  lastMatchedDate?: string;
  betCount?: number;
  commission?: number;
  priceMatched?: number;
  priceReduced?: boolean;
  sizeSettled?: number;
  profit?: number;
  sizeCancelled?: number;
  customerOrderRef?: string;
  customerStrategyRef?: string;
};

export type ItemDescription = {
  eventTypeDesc?: string;
  eventDesc?: string;
  marketDesc?: string;
  marketType?: string;
  runnerDesc?: string;
  numberOfWinners?: number;
  marketStartTime?: string;
  eachWayDivisor?: number;
};

export type PriceSize = {
  price: number;
  size: number;
};

export type PlaceExecutionReport = {
  customerRef?: string;
  status: ExecutionReportStatus;
  errorCode?: ExecutionReportErrorCode;
  marketId?: string;
  instructionReports?: PlaceInstructionReport[];
};

export type PlaceInstructionReport = {
  status: InstructionReportStatus;
  errorCode?: InstructionReportErrorCode;
  orderStatus?: OrderStatus;
  instruction: PlaceInstruction;
  betId?: string;
  placedDate?: string;
  averagePriceMatched?: number;
  sizeMatched?: number;
};

export type CancelExecutionReport = {
  customerRef?: string;
  status: ExecutionReportStatus;
  errorCode?: ExecutionReportErrorCode;
  marketId?: string;
  instructionReports?: CancelInstructionReport[];
};

export type CancelInstructionReport = {
  status: InstructionReportStatus;
  errorCode?: InstructionReportErrorCode;
  instruction: CancelInstruction;
  sizeCancelled: number;
  cancelledDate?: string;
};

export type ReplaceExecutionReport = {
  customerRef?: string;
  status: ExecutionReportStatus;
  errorCode?: ExecutionReportErrorCode;
  marketId?: string;
  instructionReports?: ReplaceInstructionReport[];
};

export type ReplaceInstructionReport = {
  status: InstructionReportStatus;
  errorCode?: InstructionReportErrorCode;
  cancelInstructionReport?: CancelInstructionReport;
  placeInstructionReport?: PlaceInstructionReport;
};

export type UpdateExecutionReport = {
  customerRef?: string;
  status: ExecutionReportStatus;
  errorCode?: ExecutionReportErrorCode;
  marketId?: string;
  instructionReports?: UpdateInstructionReport[];
};

export type UpdateInstructionReport = {
  status: InstructionReportStatus;
  errorCode?: InstructionReportErrorCode;
  instruction: UpdateInstruction;
};

export enum ExecutionReportStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  PROCESSED_WITH_ERRORS = 'PROCESSED_WITH_ERRORS',
  TIMEOUT = 'TIMEOUT',
}

export enum ExecutionReportErrorCode {
  ERROR_IN_MATCHER = 'ERROR_IN_MATCHER',
  PROCESSED_WITH_ERRORS = 'PROCESSED_WITH_ERRORS',
  BET_ACTION_ERROR = 'BET_ACTION_ERROR',
  INVALID_ACCOUNT_STATE = 'INVALID_ACCOUNT_STATE',
  INVALID_WALLET_STATUS = 'INVALID_WALLET_STATUS',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  LOSS_LIMIT_EXCEEDED = 'LOSS_LIMIT_EXCEEDED',
  MARKET_SUSPENDED = 'MARKET_SUSPENDED',
  MARKET_NOT_OPEN_FOR_BETTING = 'MARKET_NOT_OPEN_FOR_BETTING',
  DUPLICATE_TRANSACTION = 'DUPLICATE_TRANSACTION',
  INVALID_ORDER = 'INVALID_ORDER',
  INVALID_MARKET_ID = 'INVALID_MARKET_ID',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  DUPLICATE_BETIDS = 'DUPLICATE_BETIDS',
  NO_ACTION_REQUIRED = 'NO_ACTION_REQUIRED',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  REJECTED_BY_REGULATOR = 'REJECTED_BY_REGULATOR',
  NO_CHASING = 'NO_CHASING',
  REGULATOR_IS_NOT_AVAILABLE = 'REGULATOR_IS_NOT_AVAILABLE',
  TOO_MANY_INSTRUCTIONS = 'TOO_MANY_INSTRUCTIONS',
  INVALID_MARKET_VERSION = 'INVALID_MARKET_VERSION',
}

export enum InstructionReportStatus {
  SUCCESS = 'SUCCESS',
  FAILURE = 'FAILURE',
  TIMEOUT = 'TIMEOUT',
}

export enum InstructionReportErrorCode {
  INVALID_BET_SIZE = 'INVALID_BET_SIZE',
  INVALID_RUNNER = 'INVALID_RUNNER',
  BET_TAKEN_OR_LAPSED = 'BET_TAKEN_OR_LAPSED',
  BET_IN_PROGRESS = 'BET_IN_PROGRESS',
  RUNNER_REMOVED = 'RUNNER_REMOVED',
  MARKET_NOT_OPEN_FOR_BETTING = 'MARKET_NOT_OPEN_FOR_BETTING',
  LOSS_LIMIT_EXCEEDED = 'LOSS_LIMIT_EXCEEDED',
  MARKET_NOT_OPEN_FOR_BSP_BETTING = 'MARKET_NOT_OPEN_FOR_BSP_BETTING',
  INVALID_PRICE_EDIT = 'INVALID_PRICE_EDIT',
  INVALID_ODDS = 'INVALID_ODDS',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  INVALID_PERSISTENCE_TYPE = 'INVALID_PERSISTENCE_TYPE',
  ERROR_IN_MATCHER = 'ERROR_IN_MATCHER',
  INVALID_BACK_LAY_COMBINATION = 'INVALID_BACK_LAY_COMBINATION',
  ERROR_IN_ORDER = 'ERROR_IN_ORDER',
  INVALID_BID_TYPE = 'INVALID_BID_TYPE',
  INVALID_BET_ID = 'INVALID_BET_ID',
  CANCELLED_NOT_PLACED = 'CANCELLED_NOT_PLACED',
  RELATED_ACTION_FAILED = 'RELATED_ACTION_FAILED',
  NO_ACTION_REQUIRED = 'NO_ACTION_REQUIRED',
  TIME_IN_FORCE_CONFLICT = 'TIME_IN_FORCE_CONFLICT',
  UNEXPECTED_PERSISTENCE_TYPE = 'UNEXPECTED_PERSISTENCE_TYPE',
  INVALID_ORDER_TYPE = 'INVALID_ORDER_TYPE',
  UNEXPECTED_MIN_FILL_SIZE = 'UNEXPECTED_MIN_FILL_SIZE',
  INVALID_CUSTOMER_ORDER_REF = 'INVALID_CUSTOMER_ORDER_REF',
  INVALID_MIN_FILL_SIZE = 'INVALID_MIN_FILL_SIZE',
  BET_LAPSED_PRICE_IMPROVEMENT_TOO_LARGE = 'BET_LAPSED_PRICE_IMPROVEMENT_TOO_LARGE',
}

export type ComprehensiveMarketResults = {
  marketId: string;
  venue: string;
  eventName: string;
  marketTime: string;
  result: { [selectionId: number]: { status: 'WINNER' | 'LOSER' | 'REMOVED' | 'VOID'; adjustmentFactor?: number } };
  bsp: { [selectionId: number]: number };
  runners: { [selectionId: number]: { name: string; totalMatched: number } };
  settledTime?: string;
  marketStatus: MarketStatus;
  totalMatched: number;
};

export type MarketBook = {
  marketId: string;
  isMarketDataDelayed: boolean;
  status: MarketStatus;
  betDelay: number;
  bspReconciled: boolean;
  complete: boolean;
  inplay: boolean;
  numberOfWinners: number;
  numberOfRunners: number;
  numberOfActiveRunners: number;
  lastMatchTime: string;
  totalMatched: number;
  totalAvailable: number;
  crossMatching: boolean;
  runnersVoidable: boolean;
  version: number;
  runners: RunnerBook[];
  keyLineDescription: KeyLineDescription;
};

export type RunnerBook = {
  selectionId: number;
  handicap: number;
  status: RunnerStatus;
  adjustmentFactor: number;
  lastPriceTraded: number;
  totalMatched: number;
  removalDate: string;
  ex: ExchangePrices;
  sp: StartingPrices;
  orders: Order[];
  matches: Match[];
};

export type ExchangePrices = {
  availableToBack: PriceSize[];
  availableToLay: PriceSize[];
  tradedVolume: PriceSize[];
};

export type StartingPrices = {
  nearPrice: number;
  farPrice: number;
  backStakeTaken: PriceSize[];
  layLiabilityTaken: PriceSize[];
  actualSP: number;
};

export type KeyLineDescription = {
  keyLine: PriceSize[];
};

export type Order = {
  betId: string;
  orderType: OrderType;
  status: OrderStatus;
  persistenceType: PersistenceType;
  side: Side;
  price: number;
  size: number;
  bspLiability: number;
  placedDate: string;
  avgPriceMatched: number;
  sizeMatched: number;
  sizeRemaining: number;
  sizeLapsed: number;
  sizeCancelled: number;
  sizeVoided: number;
};

export type Match = {
  betId: string;
  matchId: string;
  side: Side;
  price: number;
  size: number;
  matchDate: string;
};