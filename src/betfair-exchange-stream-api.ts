import { TLSSocket } from 'tls';
import * as tls from 'tls';
import { createInterface, Interface } from 'readline';

import {
  MarketSubscriptionMessage,
  AuthenticationMessage,
  StatusMessage,
  ConnectionMessage,
  CurrencyRate,
  MarketChangeCallback,
  RawDataCallback,
} from './betfair-exchange-stream-api-types';

import {
  StreamDecoderState,
  StreamDecoderCallbacks,
  createStreamDecoderState,
  processDataPacket,
  getMarketCache,
  resetStreamDecoder,
  updateSubscribedMarkets,
} from './betfair-stream-decoder';

import {
  HeartbeatState,
  createHeartbeatState,
  startHeartbeat,
  stopHeartbeat,
  refreshHeartbeat,
} from './heartbeat';

import { generatePacketId } from './utils';

const STREAM_URL = 'stream-api.betfair.com';
const STREAM_PORT = 443;

// Stream API State
export interface StreamApiState {
  tlsSocket?: TLSSocket;
  readline?: Interface;
  authenticationStatus: boolean;
  authToken: string;
  appKey: string;
  connectionId?: string;
  pendingPackets: { [key: string]: string };
  streamDecoder: StreamDecoderState;
  heartbeat: HeartbeatState;
  segmentationEnabled: boolean;
  conflateMs: number;
  heartbeatMs: number;
  audCurrencyRate: CurrencyRate;
  lastMarketSubscription?: MarketSubscriptionMessage;
  lastMarkets: string[];
  marketChangeCallback: MarketChangeCallback;
  rawDataCallback?: RawDataCallback;
}

/**
 * Creates initial stream API state
 */
export const createStreamApiState = (
  authToken: string,
  appKey: string,
  segmentationEnabled: boolean,
  conflateMs: number,
  heartbeatMs: number,
  audCurrencyRate: CurrencyRate,
  marketChangeCallback: MarketChangeCallback,
  rawDataCallback?: RawDataCallback
): StreamApiState => {
  const onHeartAttack = () => {
    console.warn('Heartbeat timeout detected - stream may be stale, but continuing...');
    // Don't crash - just log a warning and continue
    // In production, you might want to implement reconnection logic here
  };

  return {
    authenticationStatus: false,
    authToken,
    appKey,
    pendingPackets: {},
    streamDecoder: createStreamDecoderState(audCurrencyRate),
    heartbeat: createHeartbeatState(heartbeatMs, onHeartAttack),
    segmentationEnabled,
    conflateMs,
    heartbeatMs,
    audCurrencyRate,
    lastMarkets: [],
    marketChangeCallback,
    rawDataCallback,
  };
};

/**
 * Opens the TLS stream connection
 */
export const openStream = (state: StreamApiState): Promise<StreamApiState> => {
  return new Promise((resolve, reject) => {
    try {
      const tlsSocket = tls.connect(
        {
          host: STREAM_URL,
          port: STREAM_PORT,
        },
        () => {
          console.log('Stream connected successfully');
          resolve({
            ...state,
            tlsSocket,
            authenticationStatus: false,
          });
        }
      );

      const readline = createInterface({
        input: tlsSocket,
      });

      const streamDecoderCallbacks: StreamDecoderCallbacks = {
        onMarketChange: state.marketChangeCallback,
        onStatus: (statusMessage: StatusMessage) => handleStatusMessage(state, statusMessage),
        onConnection: (connectionMessage: ConnectionMessage) => handleConnectionMessage(state, connectionMessage),
        onHeartbeat: () => handleHeartbeat(state),
      };

      readline.on('line', (data: string) => {
        // Call raw data callback first (for recording raw transmissions)
        if (state.rawDataCallback) {
          state.rawDataCallback(data);
        }

        // Refresh heartbeat on each data packet (this will start it if not already running)
        const refreshedHeartbeat = state.heartbeat.isBeating 
          ? refreshHeartbeat(state.heartbeat)
          : startHeartbeat(state.heartbeat);
        
        const updatedStreamDecoder = processDataPacket(
          state.streamDecoder,
          streamDecoderCallbacks,
          data
        );

        // Update state (in real implementation, this would be managed by state management)
        Object.assign(state, {
          heartbeat: refreshedHeartbeat,
          streamDecoder: updatedStreamDecoder,
        });
      });

      readline.on('close', () => {
        console.warn('Stream has closed');
        Object.assign(state, { authenticationStatus: false });
      });

      tlsSocket.on('error', (error: Error) => {
        console.error('Stream error:', error);
        reject(error);
      });

      Object.assign(state, { readline, tlsSocket });
    } catch (error) {
      reject(error);
    }
  });
};

/**
 * Closes the stream connection
 */
export const closeStream = (state: StreamApiState): StreamApiState => {
  if (state.tlsSocket) {
    try {
      console.log('Destroying TLS connection');
      state.tlsSocket.destroy();
    } catch (error) {
      console.error('Error destroying stream:', error);
    }
  }

  const stoppedHeartbeat = stopHeartbeat(state.heartbeat);

  return {
    ...state,
    tlsSocket: undefined,
    readline: undefined,
    authenticationStatus: false,
    heartbeat: stoppedHeartbeat,
  };
};

/**
 * Authenticates the stream connection
 */
export const authenticateStream = (state: StreamApiState): StreamApiState => {
  if (!state.tlsSocket) {
    throw new Error('Stream not connected');
  }

  const packetId = generatePacketId();
  const authMessage: AuthenticationMessage = {
    op: 'authentication',
    appKey: state.appKey,
    session: state.authToken,
    id: packetId,
  };

  const payload = JSON.stringify(authMessage);
  console.log(`Authenticating stream with payload: ${payload}`);
  
  const updatedPendingPackets = {
    ...state.pendingPackets,
    [packetId]: 'AWAITING',
  };

  state.tlsSocket.write(`${payload}\r\n`);

  return {
    ...state,
    authenticationStatus: true,
    pendingPackets: updatedPendingPackets,
  };
};

/**
 * Subscribes to market updates
 */
export const subscribeToMarkets = (
  state: StreamApiState,
  marketIds: string[]
): StreamApiState => {
  if (!state.tlsSocket || !state.authenticationStatus) {
    throw new Error('Stream not connected or authenticated');
  }

  // Clear cache and update subscribed markets
  let updatedStreamDecoder = resetStreamDecoder(state.streamDecoder);
  updatedStreamDecoder = updateSubscribedMarkets(updatedStreamDecoder, marketIds);

  // Stop heartbeat if no markets
  let updatedHeartbeat = state.heartbeat;
  if (marketIds.length === 0) {
    updatedHeartbeat = stopHeartbeat(state.heartbeat);
  }

  const message: MarketSubscriptionMessage = {
    id: generatePacketId(),
    op: 'marketSubscription',
    marketFilter: {
      marketIds,
    },
    segmentationEnabled: state.segmentationEnabled,
    conflateMs: state.conflateMs,
    heartbeatMs: state.heartbeatMs,
  };

  const payload = JSON.stringify(message);
  console.log(`Subscribing to markets: ${payload}`);

  const updatedPendingPackets = {
    ...state.pendingPackets,
    [message.id]: 'AWAITING',
  };

  state.tlsSocket.write(`${payload}\r\n`);

  return {
    ...state,
    streamDecoder: updatedStreamDecoder,
    heartbeat: updatedHeartbeat,
    lastMarketSubscription: message,
    lastMarkets: marketIds,
    pendingPackets: updatedPendingPackets,
  };
};

/**
 * Gets the current market cache
 */
export const getStreamCache = (state: StreamApiState): { [key: string]: any } => {
  return getMarketCache(state.streamDecoder);
};

/**
 * Updates authentication credentials
 */
export const setAuthCredentials = (
  state: StreamApiState,
  appKey: string,
  authToken: string
): StreamApiState => ({
  ...state,
  appKey,
  authToken,
});

/**
 * Restarts the stream connection
 */
export const restartStream = async (state: StreamApiState): Promise<StreamApiState> => {
  console.log('Restarting stream connection');
  
  let updatedState = closeStream(state);
  updatedState = await openStream(updatedState);
  updatedState = authenticateStream(updatedState);
  
  if (updatedState.lastMarketSubscription) {
    updatedState = subscribeToMarkets(updatedState, updatedState.lastMarkets);
  }
  
  return updatedState;
};

// Event Handlers
const handleStatusMessage = (state: StreamApiState, statusMessage: StatusMessage): void => {
  if (statusMessage.statusCode !== 'SUCCESS') {
    throw new Error(`Operation failed: ${JSON.stringify(statusMessage)}`);
  }
  
  // Remove from pending packets
  delete state.pendingPackets[statusMessage.id];
};

const handleConnectionMessage = (state: StreamApiState, connectionMessage: ConnectionMessage): void => {
  Object.assign(state, { connectionId: connectionMessage.connectionId });
};

const handleHeartbeat = (state: StreamApiState): void => {
  const refreshedHeartbeat = refreshHeartbeat(state.heartbeat);
  Object.assign(state, { heartbeat: refreshedHeartbeat });
};

// Higher-level API functions
export const createAndConnectStream = async (
  authToken: string,
  appKey: string,
  segmentationEnabled: boolean,
  conflateMs: number,
  heartbeatMs: number,
  audCurrencyRate: CurrencyRate,
  marketChangeCallback: MarketChangeCallback,
  rawDataCallback?: RawDataCallback
): Promise<StreamApiState> => {
  let state = createStreamApiState(
    authToken,
    appKey,
    segmentationEnabled,
    conflateMs,
    heartbeatMs,
    audCurrencyRate,
    marketChangeCallback,
    rawDataCallback
  );

  state = await openStream(state);
  state = authenticateStream(state);
  
  return state;
};

/**
 * Creates and connects a stream specifically optimized for recording with more lenient heartbeat
 */
export const createAndConnectRecordingStream = async (
  authToken: string,
  appKey: string,
  segmentationEnabled: boolean,
  conflateMs: number,
  audCurrencyRate: CurrencyRate,
  marketChangeCallback: MarketChangeCallback,
  rawDataCallback?: RawDataCallback
): Promise<StreamApiState> => {
  // Use a longer heartbeat for recording (30 seconds instead of 5)
  const recordingHeartbeatMs = 30000;
  
  return createAndConnectStream(
    authToken,
    appKey,
    segmentationEnabled,
    conflateMs,
    recordingHeartbeatMs,
    audCurrencyRate,
    marketChangeCallback,
    rawDataCallback
  );
};