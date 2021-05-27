import tls, { TLSSocket } from "tls";

import { 
    MarketSubscriptionMessage,
    AuthenticationMessage,
    StatusMessage,
    ConnectionMessage,
    CurrencyRate
} from "./BetfairExchangeStreamApiTypes";
import { BetfairStreamDecoder } from "./BetfairStreamDecoder";
import { Heartbeat } from "./Heartbeat";

import { createInterface, Interface } from "readline";
import { catBetfairExchangeStreamApi } from "./Logging";
import { generatePacketID } from "./Utils"

const BETTING_URLS = {
    stream: "stream-api.betfair.com"
};

export class BetfairExchangeStream {
    private tlsSocket: TLSSocket;

    private authenticationStatus: boolean = false;
    private authToken: string;
    private appKey: string;

    private connectionId: string;
    
    private pendingPackets: { [key: string] : string };

    private streamDecoder: BetfairStreamDecoder;

    private segmentationEnabled: boolean;
    private conflateMs: number;
    private heartbeatMs: number;
    private initialClk: string;
    private clk: string;
    private audCurrencyRate: CurrencyRate;
    private streamClose: any;

    private lastMarketSubscription: MarketSubscriptionMessage;

    private heartbeat: Heartbeat;

    private readline: Interface;

    private lastMarkets: string[];

    constructor(
        authToken: string,
        appKey: string,
        segmentationEnabled: boolean,
        conflateMs: number,
        heartbeatMs: number,
        audCurrencyRate: CurrencyRate,
        oddsUpdateCallback: any,
        streamClose: any,
    ) {
        this.audCurrencyRate = audCurrencyRate;
        this.streamDecoder = new BetfairStreamDecoder(
            audCurrencyRate, 
            oddsUpdateCallback,
            this.opStatus.bind(this),
            this.opConnection.bind(this),
            this.opHeartbeat.bind(this),
        );
        this.authToken = authToken;
        this.appKey = appKey;

        this.segmentationEnabled = segmentationEnabled;
        this.conflateMs = conflateMs;
        this.heartbeatMs = heartbeatMs;

        this.pendingPackets = {};

        this.streamClose = streamClose;

        this.heartbeat = new Heartbeat(this.heartAttack.bind(this));        
    }

    public getCache() {
        return this.streamDecoder.getCache();
    }

    public setAuthCredentials(appKey: string, authToken: string) {
        this.appKey = appKey;
        this.authToken = authToken;
    }

    private openStream() {
        this.tlsSocket = tls.connect({
            host: BETTING_URLS.stream, port: 443
        }, this.onStreamConnected.bind(this));


        this.readline = createInterface({
            input: this.tlsSocket,
        });

        this.readline.on("line", this.onStreamData.bind(this));
        this.readline.on("close", this.onStreamClose.bind(this));
        //TODO: add error case
        this.authenticationStatus = false;
    }

    public closeStream() {
        if(this.tlsSocket) {
            try {
                catBetfairExchangeStreamApi.info("Destroying TLS");
                this.tlsSocket.destroy();
            } catch(err) {
                catBetfairExchangeStreamApi.error("Error destroying the stream!", err);
            }
        } 
    }

    private heartAttack() { //This happens when we don't get a heartbeat
        catBetfairExchangeStreamApi.error("Heatattack, restarting stream!", Error());
        this.restartStream();
    }

    private opConnection(message: ConnectionMessage) {
        this.connectionId = message.connectionId;
    }

    private opStatus(statusMessage: StatusMessage) {
        if(statusMessage.statusCode !== "SUCCESS") {
            throw `Operation failed! ${statusMessage}`;
        }
        this.pendingPacketReceived(statusMessage.id);
    }

    private opHeartbeat() {
        this.heartbeat.heartbeat.bind(this.heartbeat)();
    }

    private authenticateStream() {
        var packetId = generatePacketID();
        var authMessage: AuthenticationMessage = {
            op: "authentication",
            appKey: this.appKey,
            session: this.authToken,
            id: packetId
        };

        var payload = JSON.stringify(authMessage);
        catBetfairExchangeStreamApi.debug(`Writing the payload to tls ${payload}`);
        this.pendingPacketSent(packetId);
        this.tlsSocket.write(
            `${payload}\r\n`
        );
        this.authenticationStatus = true;
    }

    private onStreamConnected() {
        catBetfairExchangeStreamApi.debug("Stream Connected!");
    }

    private onStreamData(data: string) {
        catBetfairExchangeStreamApi.silly("Heartbeat called from streamdata!");
        this.heartbeat.startBeating(this.heartbeatMs);
        this.heartbeat.heartbeat.bind(this.heartbeat)();
        this.streamDecoder.dataReceived.bind(this.streamDecoder)(data);
    }       

    private onStreamError(error: Error) {
        catBetfairExchangeStreamApi.error("The Stream Threw An error!", error);
        this.authenticationStatus = false;
        this.restartStream();
    }

    private restartStream() {
        this.closeStream();
        this.openStream();
        this.authenticateStream();
        this.writeMarketSubscription(this.lastMarketSubscription);
    }

    private onStreamClose() {
        catBetfairExchangeStreamApi.warn("The stream has closed!");
        this.authenticationStatus = false;
    }

    private writeMarketSubscription(marketSubscription: MarketSubscriptionMessage) {
        if(!this.connectionId && !this.authenticationStatus) {
            this.openStream();
            this.authenticateStream();
        }
        this.lastMarketSubscription = marketSubscription;
        var payload = JSON.stringify(marketSubscription);
        catBetfairExchangeStreamApi.debug(`Writing the payload to tls ${payload}`);
        this.pendingPacketSent(marketSubscription.id); 
        this.tlsSocket.write(`${payload}\r\n`);
    }

    public subscribeToMarkets(marketIds: string[]) {
        this.clearCache();
        this.lastMarkets = marketIds;
        if(marketIds.length === 0) {
            this.heartbeat.stopBeating();
        }
        var message: MarketSubscriptionMessage = {
            id: generatePacketID(),
            op: "marketSubscription",
            marketFilter: {
                marketIds: marketIds
            },
            segmentationEnabled: this.segmentationEnabled,
            conflateMs: this.conflateMs,
            heartbeatMs: this.heartbeatMs
        };
        catBetfairExchangeStreamApi.debug(`subscribing to markets, last payload was ${this.lastMarketSubscription} new payload is ${message}`);
        this.streamDecoder.updateSubscribedMarkets(marketIds);
        this.writeMarketSubscription(message);
    }

    private clearCache() {
        this.streamDecoder.reset();
    }

    private pendingPacketSent(id: number) {
        this.pendingPackets[id] = "AWAITING";
    }

    private pendingPacketReceived(id: number) {
        delete this.pendingPackets[id];
    }
}