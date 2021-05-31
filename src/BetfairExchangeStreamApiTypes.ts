
export type MarketChangeCallback = (marketCache: { [key: string]: MarketCache }, deltas: string[]) => void;

export type Message = {
    id: number,
    op: string,
};

export type CurrencyRate = {
    currencyCode: string,
    rate: number
}

export type StatusMessage = Message & {
    statusCode: StatusCode,
    connectionClosed: boolean,
    errorCode: string, //TODO
    errorMessage: string, //TODO
    connectionsAvailable: number
};

export type ConnectionMessage = Message & {
    connectionId: string
};

export type AuthenticationMessage = Message & {
    appKey: string,
    session: string,
}

export type SubscriptionMessage = Message & {
    segmentationEnabled: boolean,
    conflateMs: number,
    heartbeatMs: number,
    initialClk: string,
    clk: string,
};

export type ChangeMessage = SubscriptionMessage & {
    ct: ChangeType,
    status: number,
    pt: number,
    con: boolean,
    segmentationType: string,
}

export type MarketFilter = {
    marketIds?: string[],
    bspMarket?: boolean, 
    bettingTypes?: BettingType[],
    eventTypeIds?: string[],
    eventIds?: string[],
    turnInPlayEnabled?: boolean,
    marketTypes?: string[],
    venues?: string[],
    countryCodes?: string[],
    raceTypes?: string[]
}

export type MarketDataFilter = {

};

export type MarketChangeMessage = ChangeMessage & {
    mc: MarketChange[]
};

export type RunnerChange = {
    id: number,  //Selection ID
    con: boolean, //Conflated
    tv: number, //Traded volume
    ltp: number, //Last traded price
    spn: number, //Starting price near
    spf: number, //Starting price far
    batb: [number, number, number][], //Best available to back [level, price, size] array
    batl: [number, number, number][], //Best available to lay [level, price, size] array
    bdatb: [number, number, number][], //Best display available to back [level, price, size] array
    bdatl: [number, number, number][], //Best display available to back [level, price, size] array
    atb: [number, number][], //Available to back [price, size] array
    atl: [number, number][], //Available to lay [price, size] array
    spb: [number, number][], //Starting price back [price, size] array
    spl: [number, number][], //Starting price lay [price, size] array
    trd: [number, number][] //Traded [price, size] array
};

export type MarketDefinition = {
    venue: string,
    bspMarket: boolean,
    turnInPlayEnabled: boolean,
    persistenceEnabled: boolean,
    marketBaseRate: number,
    eventId: string,
    eventTypeId: string,
    numberOfWinners: number,
    bettingType: string,
    marketType: string,
    marketTime: string,
    suspendTime: string,
    bspReconciled: boolean,
    complete: boolean,
    inPlay: boolean,
    crossMatching: boolean,
    runnersVoidable: boolean,
    runners: RunnerMeta[],
    numberOfActiveRunners: number,
    betDelay: boolean,
    status: string,
    regulators: string,
    discountAllowed: boolean,
    timezone: string,
    openDate: string,
    version: number,
    name: string,
    eventName: string
};

export type RunnerMeta = {
    status: string,
    sortPriority: number,
    id: number
};

export type OrderSubscriptionMessage = Message & {
    orderFilter: OrderFilter
}

export type OrderFilter = {
    accountIds: number[],
    includeOverallPosition: boolean,
    customerStrategyRefs: string[],
    partitionMatchedByStrategyRef: boolean
}

export type OrderChangeMessage = ChangeMessage & {
    oc: OrderAccountChange
};  

export type OrderAccountChange = {
    //TODO
};

export type MarketChange = {
    id: string,
    tv: number,
    img: boolean,
    marketDefinition: MarketDefinition,
    rc: RunnerChange[]
}

export declare enum BettingType {
    ODDS = "ODDS",
    ASIAN_HANDICAP_DOUBLE_LINE = "ASIAN_HANDICAP_DOUBLE_LINE",
    ASIAN_HANDICAP_SINGLE_LINE = "ASIAN_HANDICAP_SINGLE_LINE" 
}

export declare enum StatusCode {
    SUCCESS = "SUCCESS",
    FAILURE = "FAILURE"
}

export declare enum ChangeType {
    SUB_IMAGE = "SUB_IMAGE",
    RESUB_DELTA = "RESUB_DELTA",
    HEARTBEAT = "HEARTBEAT"
}

export enum SegmentType {
    SEG_START = "SEG_START",
    SEG = "SEG",
    SEG_END = "SEG_END"
} 

export type MarketSubscriptionMessage = Message & {
    marketFilter?: MarketFilter,
    marketDataFilter?: MarketDataFilter,
    segmentationEnabled: boolean,
    conflateMs: number,
    heartbeatMs: number
};

export declare enum PacketStatus {
    AWAITING = "AWAITING",
    CLOSED = "CLOSED"
}

export type MarketCache = {
    id: string,
    runnerCache?: {
        [key: string]: RunnerCache
    },
    marketDefinition?: MarketDefinition,
    tv?: number
};

export type RunnerCache = {
    id: number,  
    con?: boolean, //Conflated
    tv?: number, //Traded volume
    ltp?: number, //Last traded price
    spn?: number, //Starting price near
    spf?: number, //Starting price far
    atb?: {
        [key: string]: number
    }, //Available to back [price, size] hashmap
    atl?: {
        [key: string]: number
    }, //Available to lay [price, size] hashmap
    spb?: {
        [key: string]: number
    }, //Starting price back [price, size] hashmap
    spl?: {
        [key: string]: number
    }, //Starting price lay [price, size] hashmap
    trd?: {
        [key: string]: number
    }, //Traded [price, size] hashmap
    batb?: {
        [key: string]: {
            size: number,
            index: number
        }
    },
    batl?: {
        [key: string]: {
            size: number,
            index: number
        }
    },
};

export declare enum ExchangeStreamStatus {
    OPEN = "OPEN",
    CLOSED = "CLOSED",
    ACTIVE = "ACTIVE"
}