import { BetfairApi } from "../src/BetfairApi";
import { MarketCache } from "../src/BetfairExchangeStreamApiTypes";

async function start(): Promise<any> {
    var betfairApi = new BetfairApi(
        "en",
        "AUD",
        500,
        500,
        onMarketChange,
    );

    await betfairApi.login("REDACTED", "REDACTED", "REDACTED");
    await betfairApi.createStream("AUD");
    await betfairApi.betfairExchangeStreamApi.subscribeToMarkets(["1.207517693"])
}

function onMarketChange(marketCache: { [key: string]: MarketCache }, deltas: string[]) {
    console.log(marketCache, deltas)
}

start();