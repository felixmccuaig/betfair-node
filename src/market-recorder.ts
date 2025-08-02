import * as fs from 'fs';
import * as path from 'path';
import { 
  MarketCache, 
  RunnerCache, 
  StreamRunnerStatus, 
  StreamMarketStatus,
  MarketChangeCallback,
  RawDataCallback 
} from './betfair-exchange-stream-api-types';

// Types for market recording
export interface MarketRecordingConfig {
  outputDirectory: string;
  enableBasicRecording: boolean;
  enableRawRecording: boolean;
  rawFilePrefix?: string;
  basicFilePrefix?: string;
  recordingMode?: 'finite' | 'perpetual'; // finite = stop when all markets complete, perpetual = run forever
  onAllMarketsComplete?: () => void; // Callback when all finite markets are complete
}

export interface BasicMarketRecord {
  marketId: string;
  marketName: string;
  eventName: string;
  marketStatus: StreamMarketStatus;
  marketTime: string;
  openDate: string;
  totalMatched: number;
  inPlay: boolean;
  bspReconciled: boolean;
  complete: boolean;
  numberOfWinners: number;
  runners: BasicRunnerRecord[];
  recordedAt: string;
  finalTotalMatched?: number;
  winners?: number[];
}

export interface BasicRunnerRecord {
  id: number;
  name: string;
  status: StreamRunnerStatus;
  adjustmentFactor: number;
  lastPriceTraded: number;
  totalMatched: number;
  bsp?: number; // Betfair Starting Price
  ltp: number; // Last Traded Price
  tv: number; // Total Volume
  spn?: number; // Starting Price Near
  spf?: number; // Starting Price Far
  finalStatus?: StreamRunnerStatus;
  isWinner: boolean;
}

export interface MarketRecorderState {
  config: MarketRecordingConfig;
  rawFileStreams: Map<string, fs.WriteStream>;
  basicRecords: Map<string, BasicMarketRecord>;
  isRecording: boolean;
  subscribedMarkets: Set<string>; // Markets we're actively recording
  completedMarkets: Set<string>; // Markets that have finished/settled
}

/**
 * Creates initial market recorder state
 */
export const createMarketRecorderState = (config: MarketRecordingConfig): MarketRecorderState => {
  // Ensure output directory exists
  if (!fs.existsSync(config.outputDirectory)) {
    fs.mkdirSync(config.outputDirectory, { recursive: true });
  }

  return {
    config: {
      recordingMode: 'finite', // Default to finite mode
      ...config,
    },
    rawFileStreams: new Map(),
    basicRecords: new Map(),
    isRecording: false,
    subscribedMarkets: new Set(),
    completedMarkets: new Set(),
  };
};

/**
 * Starts recording for specified markets
 */
export const startRecording = (
  state: MarketRecorderState, 
  marketIds: string[]
): MarketRecorderState => {
  const updatedState = { 
    ...state, 
    isRecording: true,
    subscribedMarkets: new Set([...state.subscribedMarkets, ...marketIds])
  };

  // Initialize raw file streams if enabled
  if (state.config.enableRawRecording) {
    marketIds.forEach(marketId => {
      if (!state.rawFileStreams.has(marketId)) {
        const filename = `${state.config.rawFilePrefix || ''}${marketId}.txt`;
        const filepath = path.join(state.config.outputDirectory, filename);
        const writeStream = fs.createWriteStream(filepath, { flags: 'a' });
        
        // Write header
        writeStream.write(`# Raw market data for market: ${marketId}\n`);
        writeStream.write(`# Started at: ${new Date().toISOString()}\n`);
        writeStream.write(`# Format: Each line contains raw JSON transmission from Betfair Exchange Stream API\n\n`);
        
        updatedState.rawFileStreams.set(marketId, writeStream);
      }
    });
  }

  return updatedState;
};

/**
 * Stops recording and closes all file streams
 */
export const stopRecording = (state: MarketRecorderState): MarketRecorderState => {
  // Close all raw file streams
  state.rawFileStreams.forEach((stream, marketId) => {
    stream.write(`\n# Recording stopped at: ${new Date().toISOString()}\n`);
    stream.end();
  });

  // Save all basic records to files
  if (state.config.enableBasicRecording) {
    state.basicRecords.forEach((record, marketId) => {
      saveBasicRecord(state.config, record);
    });
  }

  return {
    ...state,
    rawFileStreams: new Map(),
    basicRecords: new Map(),
    isRecording: false,
  };
};

/**
 * Records raw transmission data to file
 */
export const recordRawTransmission = (
  state: MarketRecorderState,
  rawData: string
): void => {
  if (!state.isRecording || !state.config.enableRawRecording) {
    return;
  }

  try {
    // Parse the raw data to extract market IDs for routing to specific files
    const parsedData = JSON.parse(rawData);
    
    // Handle market change messages - route to specific market files
    if (parsedData.mc && Array.isArray(parsedData.mc)) {
      parsedData.mc.forEach((marketChange: any) => {
        const marketId = marketChange.id;
        const stream = state.rawFileStreams.get(marketId);
        if (stream) {
          stream.write(`${rawData}\n`);
        }
      });
    } else {
      // For non-market-specific messages (connection, status, etc.), write to all active streams
      state.rawFileStreams.forEach((stream) => {
        stream.write(`${rawData}\n`);
      });
    }
  } catch (error) {
    console.error('Error parsing raw transmission for routing:', error);
    // If parsing fails, write to all active streams to ensure no data is lost
    state.rawFileStreams.forEach((stream) => {
      stream.write(`${rawData}\n`);
    });
  }
};

/**
 * Updates basic market record from market cache
 */
export const updateBasicRecord = (
  state: MarketRecorderState,
  marketCache: MarketCache
): void => {
  if (!state.isRecording || !state.config.enableBasicRecording) {
    return;
  }

  const marketId = marketCache.marketId;
  const marketDef = marketCache.marketDefinition;

  // Create or update basic record
  const existingRecord = state.basicRecords.get(marketId);
  
  const runners: BasicRunnerRecord[] = Object.values(marketCache.runners).map(runner => {
    // Try to find runner name from market definition
    const runnerDef = marketDef.runners.find(r => r.id === runner.id);
    const runnerName = runnerDef ? getRunnerName(runnerDef) : `Runner ${runner.id}`;

    return {
      id: runner.id,
      name: runnerName,
      status: runner.status,
      adjustmentFactor: runner.adjustmentFactor,
      lastPriceTraded: runner.lastPriceTraded,
      totalMatched: runner.totalMatched,
      bsp: runnerDef?.bsp,
      ltp: runner.ltp,
      tv: runner.tv,
      spn: runner.spn,
      spf: runner.spf,
      finalStatus: runner.status,
      isWinner: runner.status === StreamRunnerStatus.WINNER,
    };
  });

  const basicRecord: BasicMarketRecord = {
    marketId,
    marketName: marketDef.name || `Market ${marketId}`,
    eventName: marketDef.eventName || 'Unknown Event',
    marketStatus: marketDef.status,
    marketTime: marketDef.marketTime,
    openDate: marketDef.openDate,
    totalMatched: marketDef.totalMatched,
    inPlay: marketDef.inPlay,
    bspReconciled: marketDef.bspReconciled,
    complete: marketDef.complete,
    numberOfWinners: marketDef.numberOfWinners,
    runners,
    recordedAt: new Date().toISOString(),
    finalTotalMatched: marketDef.complete ? marketDef.totalMatched : undefined,
    winners: runners.filter(r => r.isWinner).map(r => r.id),
  };

  state.basicRecords.set(marketId, basicRecord);

  // If market is complete, save the record immediately and track completion
  if (marketDef.complete || marketDef.status === StreamMarketStatus.CLOSED) {
    saveBasicRecord(state.config, basicRecord);
    
    // Mark market as completed
    if (!state.completedMarkets.has(marketId)) {
      state.completedMarkets.add(marketId);
      console.log(`🏁 Market ${marketDef.name || marketId} completed and recorded`);
      
      // Check if all finite markets are complete
      checkAllMarketsComplete(state);
    }
  }
};

/**
 * Checks if all subscribed markets are complete and triggers callback if so
 */
const checkAllMarketsComplete = (state: MarketRecorderState): void => {
  if (state.config.recordingMode === 'perpetual') {
    return; // Never stop for perpetual recording
  }

  const allMarketsComplete = Array.from(state.subscribedMarkets).every(marketId => 
    state.completedMarkets.has(marketId)
  );

  if (allMarketsComplete && state.subscribedMarkets.size > 0) {
    console.log(`✅ All ${state.subscribedMarkets.size} markets completed - recording finished!`);
    if (state.config.onAllMarketsComplete) {
      state.config.onAllMarketsComplete();
    }
  }
};

/**
 * Gets completion status for all markets
 */
export const getRecordingCompletionStatus = (state: MarketRecorderState): {
  totalMarkets: number;
  completedMarkets: number;
  pendingMarkets: string[];
  isAllComplete: boolean;
  recordingMode: 'finite' | 'perpetual';
} => {
  const totalMarkets = state.subscribedMarkets.size;
  const completedMarkets = state.completedMarkets.size;
  const pendingMarkets = Array.from(state.subscribedMarkets).filter(
    marketId => !state.completedMarkets.has(marketId)
  );
  const isAllComplete = state.config.recordingMode === 'finite' && 
    totalMarkets > 0 && 
    completedMarkets === totalMarkets;

  return {
    totalMarkets,
    completedMarkets,
    pendingMarkets,
    isAllComplete,
    recordingMode: state.config.recordingMode || 'finite',
  };
};

/**
 * Adds new markets to an existing recording session
 */
export const addMarketsToRecording = (
  state: MarketRecorderState,
  marketIds: string[]
): MarketRecorderState => {
  if (!state.isRecording) {
    console.warn('Cannot add markets: recording is not active');
    return state;
  }

  console.log(`📈 Adding ${marketIds.length} new markets to recording`);
  return startRecording(state, marketIds);
};

/**
 * Creates a raw data callback for recording raw transmissions
 */
export const createRawDataCallback = (state: MarketRecorderState): RawDataCallback => {
  return (rawData: string) => {
    recordRawTransmission(state, rawData);
  };
};

/**
 * Creates a market change callback that handles basic recording
 */
export const createRecordingMarketChangeCallback = (
  state: MarketRecorderState,
  originalCallback?: MarketChangeCallback
): MarketChangeCallback => {
  return (marketCache: { [key: string]: MarketCache }, deltas: string[]) => {
    // Update basic records
    if (state.config.enableBasicRecording) {
      Object.values(marketCache).forEach(cache => {
        updateBasicRecord(state, cache);
      });
    }

    // Call original callback if provided
    if (originalCallback) {
      originalCallback(marketCache, deltas);
    }
  };
};

/**
 * Saves a basic market record to file
 */
const saveBasicRecord = (config: MarketRecordingConfig, record: BasicMarketRecord): void => {
  try {
    const filename = `${config.basicFilePrefix || 'basic_'}${record.marketId}.json`;
    const filepath = path.join(config.outputDirectory, filename);
    
    const recordWithMetadata = {
      ...record,
      recordingMetadata: {
        version: '1.0',
        createdAt: new Date().toISOString(),
        recordingType: 'basic',
      }
    };

    fs.writeFileSync(filepath, JSON.stringify(recordWithMetadata, null, 2));
  } catch (error) {
    console.error(`Error saving basic record for market ${record.marketId}:`, error);
  }
};

/**
 * Gets runner name from runner definition (fallback to ID if no name available)
 */
const getRunnerName = (runnerDef: any): string => {
  // Runner definitions might have different name fields depending on the sport
  if (runnerDef.name) return runnerDef.name;
  if (runnerDef.runnerName) return runnerDef.runnerName;
  if (runnerDef.selectionName) return runnerDef.selectionName;
  return `Runner ${runnerDef.id}`;
};

/**
 * Gets recording status for a market
 */
export const getRecordingStatus = (
  state: MarketRecorderState,
  marketId: string
): {
  isRecording: boolean;
  hasRawStream: boolean;
  hasBasicRecord: boolean;
  rawFilePath?: string;
  basicFilePath?: string;
} => {
  const hasRawStream = state.rawFileStreams.has(marketId);
  const hasBasicRecord = state.basicRecords.has(marketId);
  
  let rawFilePath: string | undefined;
  let basicFilePath: string | undefined;

  if (hasRawStream) {
    const filename = `${state.config.rawFilePrefix || ''}${marketId}.txt`;
    rawFilePath = path.join(state.config.outputDirectory, filename);
  }

  if (hasBasicRecord) {
    const filename = `${state.config.basicFilePrefix || 'basic_'}${marketId}.json`;
    basicFilePath = path.join(state.config.outputDirectory, filename);
  }

  return {
    isRecording: state.isRecording,
    hasRawStream,
    hasBasicRecord,
    rawFilePath,
    basicFilePath,
  };
};

/**
 * Loads a basic market record from file
 */
export const loadBasicRecord = (
  config: MarketRecordingConfig,
  marketId: string
): BasicMarketRecord | null => {
  try {
    const filename = `${config.basicFilePrefix || 'basic_'}${marketId}.json`;
    const filepath = path.join(config.outputDirectory, filename);
    
    if (!fs.existsSync(filepath)) {
      return null;
    }

    const fileContent = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(`Error loading basic record for market ${marketId}:`, error);
    return null;
  }
};

/**
 * Lists all recorded markets in the output directory
 */
export const listRecordedMarkets = (config: MarketRecordingConfig): {
  basicRecords: string[];
  rawRecords: string[];
} => {
  try {
    const files = fs.readdirSync(config.outputDirectory);
    
    const basicPrefix = config.basicFilePrefix || 'basic_';
    const rawPrefix = config.rawFilePrefix || '';
    
    const basicRecords = files
      .filter(f => f.startsWith(basicPrefix) && f.endsWith('.json'))
      .map(f => f.replace(basicPrefix, '').replace('.json', ''));
    
    const rawRecords = files
      .filter(f => f.startsWith(rawPrefix) && f.endsWith('.txt') && !f.startsWith(basicPrefix))
      .map(f => f.replace(rawPrefix, '').replace('.txt', ''));

    return { basicRecords, rawRecords };
  } catch (error) {
    console.error('Error listing recorded markets:', error);
    return { basicRecords: [], rawRecords: [] };
  }
};