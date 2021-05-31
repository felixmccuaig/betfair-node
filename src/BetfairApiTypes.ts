export type MarketFilter = {
    textQuery?: string,
    eventTypeIds?: string[],
    eventIds?: string[],
    competitionIds?: string[],
    marketIds?: string[],
    venues?: string[],
    bspOnly?: boolean,
    turnInPlayEnabled?: boolean,
    inPlayOnly?: boolean,
    marketBettingTypes?: MarketBettingType[],
    marketCountries?: string[],
    marketTypeCodes?: string[],
    marketStartTime?: MarketTimeRange,
    withOrders?: OrderStatus[],
    raceTypes?: string[]
};

export enum SortDir {
    EARLIEST_TO_LATEST = "EARLIEST_TO_LATEST",
    LATEST_TO_EARLIEST = "LATEST_TO_EARLIEST"
}

export enum BetStatus {
    SETTLED = "SETTLED",
    VOIDED = "VOIDED",
    LAPSED = "LAPSED",
    CANCELLED = "CANCELLED"
}

export type OrderSubscription = {
    
};

export type MarketCatalogue = {
    marketId: string,
    marketName: string,
    marketStartTime?: string,
    description?: MarketDescription,
    totalMatched?: number,
    runners?: RunnerCatalogue[],
    eventType?: EventType,
    competition?: Competition,
    event?: Event
}

export type RunnerCatalogue = {
    selectionId: number,
    runnerName: string,
    handicap: number,
    sortPriority: number,
    metadata: {
        [key: string] : string
    }
};

export type EventType = {
    id: string,
    name: string
};

export type PlaceInstruction = {
    orderType: OrderType,
    selectionId: number,
    handicap?: number,
    side: string,
    limitOrder?: LimitOrder,
    //limitOnCloseOrder?: LimitOnCloseOrder, //TODO: ADD THESE
    //marketOnCloseOrder?: MarketOnCloseOrder,
    customerOrderRef?: string
};

export enum OrderType {
    LIMIT = "LIMIT",
    LIMIT_ON_CLOSE = "LIMIT_ON_CLOSE",
    MARKET_ON_CLOSE = "MARKET_ON_CLOSE"
}

export type LimitOrder = {
    size: number,
    price: number,
    persistenceType: PersistenceType,
    timeInForce?: timeInForce,
    minFillSize?: number,
    betTargetType?: string,
    betTargetSize?: string
}

export enum PersistenceType {
    LAPSE = "LAPSE",
    PERSIST = "PERSIST",
    MARKET_ON_CLOSE = "MARKET_ON_CLOSE"
}

export enum timeInForce {
    FILL_OR_KILL = "FILL_OR_KILL"
}

export type Competition = {
    id: string,
    name: string
};

export type MarketDescription = {
    persistenceEnabled: boolean,
    bspMarket: boolean,
    marketTime: Date,
    suspendTime: Date,
    settleTime?: Date,
    bettingType: string,
    turnInPlayEnabled: boolean,
    marketType: string,
    regulator: string,
    marketBaseRate: number,
    discountAllowed: boolean,
    wallet?: string,
    rules?: string,
    rulesHasDate?: boolean,
    eachWayDivisor?: number,
    clarifications?: string,
    lineRangeInfo?: MarketLineRangeInfo,
    raceType?: string,
    priceLadderDescription?: PriceLadderDescription
}

export type MarketLineRangeInfo = {
    maxUnitValue: number,
    minUnitValue: number,
    interval: number,
    marketUnit: string
};

export type PriceLadderDescription = {
    type: PriceLadderType    
};

export enum PriceLadderType {
    CLASSIC = "CLASSIC",
    FINEST = "FINEST",
    LINE_RANGE = "LINE_RANGE"
};

export type Event = {
    id: string,
    name: string,
    countryCode: string,
    timezone: string,
    venue: string,
    openDate: string
};

export declare enum MarketBettingType {
    ODDS = "ODDS",
    LINE = "LINE",
    RANGE = "RANGE", 
    ASIAN_HANDICAP_DOUBLE_LINE = "ASIAN_HANDICAP_DOUBLE_LINE",
    ASIAN_HANDICAP_SINGLE_LINE = "ASIAN_HANDICAP_SINGLE_LINE",
    FIXED_ODDS = "FIXED_ODDS"
}

export declare enum MarketSort {
    MINIMUM_TRADED = "MINIMUM_TRADED",
    MAXIMUM_TRADED = "MAXIMUM_TRADED",
    MINIMUM_AVAILABLE = "MINIMUM_AVAILABLE",
    MAXIMUM_AVAILABLE = "MAXIMUM_AVAILABLE",
    FIRST_TO_START = "FIRST_TO_START",
    LAST_TO_START = "LAST_TO_START"
};

export type MarketTimeRange = {
    from: string,
    to: string
};  

export declare enum OrderStatus {
    PENDING = "PENDING",
    EXECUTION_COMPLETE = "EXECUTION_COMPLETE",
    EXECUTABLE = "EXECUTABLE",
    EXPIRED = "EXPIRED"
}

export enum MarketProjection {
    COMPETITION = "COMPETITION",
    EVENT = "EVENT",
    EVENT_TYPE = "EVENT_TYPE",
    MARKET_START_TIME = "MARKET_START_TIME",
    MARKET_DESCRIPTION = "MARKET_DESCRIPTION",
    RUNNER_DESCRIPTION = "RUNNER_DESCRIPTION",
    RUNNER_METADATA = "RUNNER_METADATA"
}

export declare enum PriceData {
    SP_AVAILABLE,
    SP_TRADED,
    EX_BEST_OFFERS,
    EX_ALL_OFFERS,
    EX_TRADED
}

export declare enum MatchProjection {
    NO_ROLLUP,
    ROLLED_UP_BY_PRICE,
    ROLLED_UP_BY_AVG_PRICE
}

export declare enum OrderProjection {
    ALL,
    EXECUTABLE,
    EXECUTION_COMPLETE
}

export declare enum MarketStatus {
    INACTIVE,
    OPEN,
    SUSPENDED,
    CLOSED
}

export declare enum RunnerStatus {
    ACTIVE,
    WINNER,
    LOSER,
    PLACED,
    REMOVED_VACANT,
    REMOVED,
    HIDDEN
}

