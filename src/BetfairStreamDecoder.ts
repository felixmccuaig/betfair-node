import { catBetfairStreamDecoder } from "./Logging";
import { ConnectionMessage, CurrencyRate, MarketCache, MarketChange, MarketChangeMessage, Message, RunnerCache, RunnerChange, StatusMessage } from "./BetfairExchangeStreamApiTypes";

import util from "util";

export class BetfairStreamDecoder {
    private marketCache: { [key: string]: MarketCache } = {};

    private currencyRate: CurrencyRate;

    private opMcm: any; //Oddsupdate function to call
    private opStatus: any;
    private opConnection: any;
    private opHeartbeat: any;

    private deltas: string[] = [];

    private subscribedMarkets: string[] = [];

    constructor(
        currencyRate: CurrencyRate, 
        opMcm: any,
        opStatus: any,
        opConnection: any,
        opHeartbeat: any
        ) {
        this.currencyRate = currencyRate;
        this.opMcm = opMcm;
        this.opStatus = opStatus;
        this.opConnection = opConnection;
        this.opHeartbeat = opHeartbeat;
    }
    
    public dataReceived(packet: string) {
        this.decodePacket(<Message> JSON.parse(packet));
    }

    public getCache() {
        return this.marketCache;
    }

    private clearCache() {
        this.marketCache = {};
    }

    public reset() {
        this.clearCache();
    }

    public updateCurrencyRate(currencyRate: CurrencyRate) {
        this.currencyRate = currencyRate;
    }

    public updateSubscribedMarkets(markets: string[]) {
        this.subscribedMarkets = markets;
    }

    private decodePacket(message: Message) {
        switch(message.op) {
            case "connection": {
                this.opConnection(<ConnectionMessage> message);
                return;
            }
            case "status": {
                this.opStatus(<StatusMessage> message);
                return;
            }
            case "mcm": {
                this.decodeMarketChangeMessage(<MarketChangeMessage> message);
                return;
            }
        }
    }

    private decodeMarketChangeMessage(marketSubscriptionMessage: MarketChangeMessage) {
        switch(marketSubscriptionMessage.ct) {
            case "HEARTBEAT": {
                catBetfairStreamDecoder.silly(`Calling heartbeat from recv heartbeat`);
                this.decodeHeartbeat(marketSubscriptionMessage);
                return;
            }
        }
        this.decodeSubImage(marketSubscriptionMessage);
        this.opMcm(this.marketCache, this.deltas);
        this.deltas = []; //Clear deltas
    }

    private decodeHeartbeat(heartbeat: MarketChangeMessage) {
        this.opHeartbeat();
    }

    private decodeSubImage(marketSubscriptionMessage: MarketChangeMessage) {
        if(marketSubscriptionMessage.mc) {
            for(var marketChangeIndex in marketSubscriptionMessage.mc) {
                var marketChange: MarketChange = marketSubscriptionMessage.mc[marketChangeIndex];

                if(this.subscribedMarkets.indexOf(marketChange.id) === -1) {
                    continue;
                }

                this.deltas.push(marketChange.id);

                if(marketChange.img && (marketChange.id in this.marketCache)) {
                    delete this.marketCache[marketChange.id]; //Img = true, then it's not a delta
                }
                if(!(marketChange.id in this.marketCache)) { //Create the market cache 
                    this.marketCache[marketChange.id] = this.createMarketCache(
                        this.marketCache[marketChange.id], 
                        marketChange
                    );
                }

                var marketCache = this.marketCache[marketChange.id];

                if(marketChange.marketDefinition) {
                    marketCache.marketDefinition = marketChange.marketDefinition;
                }

                if(marketChange.tv) {
                    marketCache.tv = this.convertCurrency(marketChange.tv);
                }

                for(var runnerChangeIndex in marketChange.rc) {
                    var runnerChange = marketChange.rc[runnerChangeIndex];
                    var runnerCache = marketCache.runnerCache[`${runnerChange.id}`];
                    var pt = marketSubscriptionMessage.pt;

                    this.marketCacheUpdateRunner(
                        runnerCache, 
                        runnerChange,
                    )
                }
            }
        }
    }

    private createMarketCache(marketCache: MarketCache, marketChange: MarketChange) {
        if(!marketCache) {
            marketCache = {
                id: marketChange.id
            };
        }

        if(!marketChange.marketDefinition) {
            catBetfairStreamDecoder.error( 
                `Error, create market cache marketchange wasn't given a definition MARKETCACHE: ${
                    util.inspect(marketCache)
                } MARKETCHANGE: ${
                    util.inspect(marketChange)
                }`
            );
            return;
        }

        if(!marketCache || !marketChange) { //TODO: This may be redundant
            throw "All of marketCache, marketChange must exist!"
        }

        if(!marketChange.marketDefinition) {
            throw "Market definition must exist!"
        }

        marketCache.marketDefinition = marketChange.marketDefinition;
        marketCache.runnerCache = {};

        this.createRunnerCache(marketCache, marketChange);
        return marketCache;
    }

    private createRunnerCache(marketCache: MarketCache, marketChange: MarketChange) {
        if(!marketChange || !marketCache) {
            throw "Error occurred in createRunnerCache!";
        }

        for(var runnerChange of marketChange.rc) {
            if(!marketCache.runnerCache[runnerChange.id]) {
                marketCache.runnerCache[runnerChange.id] = {
                    id: runnerChange.id
                };
            }
            marketCache.runnerCache[runnerChange.id] = this.marketCacheUpdateRunner(
                marketCache.runnerCache[runnerChange.id],
                runnerChange,
            );
        }
    }

    private convertCurrency(size: number) {
        return size * this.currencyRate.rate;
    }

    private marketCacheUpdateRunner(runnerCache: RunnerCache, rc: RunnerChange): RunnerCache {
        if(!runnerCache) {
            throw "RunnerCache must exist!";
        }

        if(rc.ltp) {
            runnerCache.ltp = rc.ltp;
        }

        if(rc.tv) {
            runnerCache.tv = this.convertCurrency(rc.tv);
        }

        if(rc.spn) {
            runnerCache.spn = rc.spn;
        }

        if(rc.spf) {
            runnerCache.spf = rc.spf;
        }

        if(rc.atb) { //availableToBack: Full Depth ladder / price point
            if(!runnerCache.atb) {
                runnerCache.atb = {};
            }
            var availableToBack = rc.atb;
            for(var i = 0; i < availableToBack.length; i++) {
                if(availableToBack[i][1] == 0) { //If size is 0 then delete price point entry.
                    delete runnerCache.atb[`${availableToBack[i][0]}`];
                } else {
                    runnerCache.atb[`${availableToBack[i][0]}`] = this.convertCurrency(availableToBack[i][1]);
                }
            }
        }

        if(rc.atl) { // availableToLay: Full Depth ladder / price point
            if(!runnerCache.atl) {
                runnerCache.atl = {};
            }
            var availableToLay = rc.atl;
            for(var i = 0; i < availableToLay.length; i++) {
                if(availableToLay[i][1] == 0) { //If size is 0 then delete price point entry.
                    delete runnerCache.atl[`${availableToLay[i][0]}`];
                } else {
                    runnerCache.atl[`${availableToLay[i][0]}`] = this.convertCurrency(availableToLay[i][1]);
                }
            }
        }

        if(rc.spb) { //startingPriceBack: Full Depth ladder / price point
            if(!runnerCache.spb) {
                runnerCache.spb = {};
            }
            var startingPriceBack = rc.spb;
            for(var i = 0; i < startingPriceBack.length; i++) {
                if(startingPriceBack[i][1] == 0) { //If size is 0 then delete price point entry.
                    delete runnerCache.spb[`${startingPriceBack[i][0]}`];
                } else {
                    runnerCache.spb[`${startingPriceBack[i][0]}`] = this.convertCurrency(startingPriceBack[i][1]);
                }
            }
        }

        if(rc.spl) { //startingPriceLay: Full Depth ladder / price point
            if(!runnerCache.spl) {
                runnerCache.spl = {};
            }
            var startingPriceLay = rc.spl;
            for(var i = 0; i < startingPriceLay.length; i++) {
                if(startingPriceLay[i][1] == 0) { //If size is 0 then delete price point entry.
                    delete runnerCache.spl[`${startingPriceLay[i][0]}`];
                } else {
                    runnerCache.spl[`${startingPriceLay[i][0]}`] = this.convertCurrency(startingPriceLay[i][1]);
                }
            }
        }

        if(rc.trd) { //traded: Full Depth ladder / price point
            if(!runnerCache.trd) {
                runnerCache.trd = {};
            }
            var traded = rc.trd;
            for(var i = 0; i < traded.length; i++) {
                if(traded[i][1] == 0) { //If size is 0 then delete price point entry.
                    delete runnerCache.trd[`${traded[i][0]}`];
                } else {
                    runnerCache.trd[`${traded[i][0]}`] = this.convertCurrency(traded[i][1]);
                }
            }
        }

        if(rc.batb) { //bestAvailableToBack Depth Based ladder
            if(!runnerCache.batb) {
                runnerCache.batb = {};
            }
            var bestAvailableToBack = rc.batb;
            for(var i = 0; i < bestAvailableToBack.length; i++) {
                if(bestAvailableToBack[i][2] == 0) { //If size is 0 then delete price point entry.
                    delete runnerCache.batb[`${bestAvailableToBack[i][1]}`];
                } else {
                    runnerCache.batb[`${bestAvailableToBack[i][1]}`] = {
                        size: this.convertCurrency(bestAvailableToBack[i][2]), 
                        index: bestAvailableToBack[i][0]
                    };
                }
            }
        }

        if(rc.batl) { //bestAvailableToLay Depth Based ladder
            if(!runnerCache.batl) {
                runnerCache.batl = {};
            }
            var bestAvailableToLay = rc.batl;
            for(var i = 0; i < bestAvailableToLay.length; i++) {
                if(bestAvailableToLay[i][2] == 0) { //If size is 0 then delete price point entry.
                    delete runnerCache.batl[`${bestAvailableToLay[i][1]}`];
                } else {
                    runnerCache.batl[`${bestAvailableToLay[i][1]}`] = {
                        size: this.convertCurrency(bestAvailableToLay[i][2]), 
                        index: bestAvailableToLay[i][0]
                    };
                }
            }
        }
        return runnerCache;
    }
}