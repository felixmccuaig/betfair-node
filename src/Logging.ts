const logger = {
    debug: (...args) => console.log(args),
    silly: (...args) => console.log(args),
};

export var catBetfairExchangeStreamApi: any = logger;
export var catBetfairApi: any = logger;
export var catRequestConflater: any = logger;
export var catBetfairStreamDecoder: any = logger;
export var catHeartbeat: any = logger;

