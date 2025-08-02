import * as fs from 'fs';
import * as path from 'path';
import { 
  MarketCache, 
  RunnerCache, 
  StreamRunnerStatus, 
  StreamMarketStatus,
  MarketChangeCallback,
  RawDataCallback,
  MarketDefinition
} from './betfair-exchange-stream-api-types';
import { 
  BetfairApiState, 
  listMarketCatalogue 
} from './betfair-api';
import { MarketCatalogue, MarketSort } from './betfair-api-types';

// Types for market recording
export interface MarketRecordingConfig {
  outputDirectory: string;
  enableBasicRecording: boolean;
  enableRawRecording: boolean;
  rawFilePrefix?: string;
  basicFilePrefix?: string;
  recordingMode?: 'finite' | 'perpetual'; // finite = stop when all markets complete, perpetual = run forever
  onAllMarketsComplete?: () => void; // Callback when all finite markets are complete
  enrichment?: {
    enabled: boolean;
    apiState: BetfairApiState; // Required for REST API calls
    cacheExpiryMinutes?: number; // How long to cache market catalogue data
  };
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
  // Reconciliation fields
  reconciled?: boolean; // True when volumes calculated from trading data
  reconciliationTime?: string; // When reconciliation happened
  calculatedTotalTurnover?: number; // Sum of all runner turnovers
  liquidityProfile?: {
    totalUniquePrice: number; // Number of different prices traded across all runners
    averageSpread?: number; // Average bid-ask spread
    marketDepth: number; // Total volume available
  };
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
  tv: number; // Total Volume (calculated from trading data when reconciled)
  spn?: number; // Starting Price Near
  spf?: number; // Starting Price Far
  finalStatus?: StreamRunnerStatus;
  isWinner: boolean;
  // Reconciliation fields
  reconciledVolume?: number; // Calculated from trd array
  totalTurnover?: number; // Sum of price * volume
  volumeWeightedPrice?: number; // Average price weighted by volume
  priceRange?: {
    highest: number;
    lowest: number;
    trades: number; // Number of different prices traded
  };
  tradingActivity?: [number, number][]; // [price, volume] pairs (top 10 by volume)
}

export interface MarketRecorderState {
  config: MarketRecordingConfig;
  rawFileStreams: Map<string, fs.WriteStream>;
  basicRecords: Map<string, BasicMarketRecord>;
  isRecording: boolean;
  subscribedMarkets: Set<string>; // Markets we're actively recording
  completedMarkets: Set<string>; // Markets that have finished/settled
  enrichmentCache: Map<string, { catalogue: MarketCatalogue; cachedAt: Date }>; // Market catalogue cache
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
    enrichmentCache: new Map(),
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
 * Calculates reconciled trading data from runner cache
 */
const calculateRunnerTradingData = (runnerCache: RunnerCache): {
  reconciledVolume: number;
  totalTurnover: number;
  volumeWeightedPrice: number;
  priceRange?: {
    highest: number;
    lowest: number;
    trades: number;
  };
  tradingActivity: [number, number][];
} => {
  const trd = runnerCache.trd || [];
  
  if (trd.length === 0) {
    return {
      reconciledVolume: 0,
      totalTurnover: 0,
      volumeWeightedPrice: 0,
      tradingActivity: []
    };
  }

  // Filter out zero volume trades and calculate totals
  const activeTrades = trd.filter(([price, volume]: [number, number]) => volume > 0);
  
  const reconciledVolume = activeTrades.reduce((sum: number, [, volume]: [number, number]) => sum + volume, 0);
  const totalTurnover = activeTrades.reduce((sum: number, [price, volume]: [number, number]) => sum + (price * volume), 0);
  const volumeWeightedPrice = reconciledVolume > 0 ? totalTurnover / reconciledVolume : 0;

  // Calculate price range
  let priceRange: { highest: number; lowest: number; trades: number } | undefined;
  if (activeTrades.length > 0) {
    const prices = activeTrades.map(([price]: [number, number]) => price);
    priceRange = {
      highest: Math.max(...prices),
      lowest: Math.min(...prices),
      trades: activeTrades.length
    };
  }

  // Get top 10 trading activities by volume
  const tradingActivity = activeTrades
    .sort(([, a]: [number, number], [, b]: [number, number]) => b - a) // Sort by volume desc
    .slice(0, 10); // Top 10

  return {
    reconciledVolume,
    totalTurnover,
    volumeWeightedPrice,
    priceRange,
    tradingActivity
  };
};

/**
 * Reconciles a runner's trading data when market completes
 */
const reconcileRunnerData = (
  basicRunner: BasicRunnerRecord,
  runnerCache: RunnerCache,
  isMarketComplete: boolean
): BasicRunnerRecord => {
  // Only reconcile when market is complete and has trading data
  if (!isMarketComplete || !runnerCache.trd || runnerCache.trd.length === 0) {
    return basicRunner;
  }

  const tradingData = calculateRunnerTradingData(runnerCache);

  return {
    ...basicRunner,
    // Update tv with calculated volume instead of Betfair's (often 0)
    tv: tradingData.reconciledVolume,
    // Add reconciliation data
    reconciledVolume: tradingData.reconciledVolume,
    totalTurnover: tradingData.totalTurnover,
    volumeWeightedPrice: tradingData.volumeWeightedPrice,
    priceRange: tradingData.priceRange,
    tradingActivity: tradingData.tradingActivity
  };
};

/**
 * Determines if a market is truly complete based on status and runner states
 * Fixes issue where Betfair's 'complete' flag is unreliable
 */
const isMarketTrulyComplete = (
  marketDef: MarketDefinition, 
  runners: BasicRunnerRecord[]
): boolean => {
  // Market is definitely complete if closed
  if (marketDef.status === StreamMarketStatus.CLOSED) {
    return true;
  }
  
  // Market is NOT complete if still open or inactive
  if (marketDef.status === StreamMarketStatus.OPEN || 
      marketDef.status === StreamMarketStatus.INACTIVE) {
    return false;
  }
  
  // For suspended markets, check if all runners have final status
  if (marketDef.status === StreamMarketStatus.SUSPENDED) {
    const finalStatuses = [
      StreamRunnerStatus.WINNER,
      StreamRunnerStatus.LOSER, 
      StreamRunnerStatus.PLACED,
      StreamRunnerStatus.REMOVED_VACANT,
      StreamRunnerStatus.REMOVED
    ];
    
    const allRunnersHaveFinalStatus = runners.every(runner => 
      finalStatuses.includes(runner.status)
    );
    
    return allRunnersHaveFinalStatus;
  }
  
  return false;
};

/**
 * Enriches market data with REST API catalogue information
 */
const enrichMarketData = async (
  state: MarketRecorderState,
  marketId: string,
  basicRecord: BasicMarketRecord
): Promise<BasicMarketRecord> => {
  if (!state.config.enrichment?.enabled || !state.config.enrichment.apiState) {
    return basicRecord;
  }

  try {
    // Check cache first
    const cached = state.enrichmentCache.get(marketId);
    const cacheExpiryMs = (state.config.enrichment.cacheExpiryMinutes || 60) * 60 * 1000;
    
    let marketCatalogue: MarketCatalogue | undefined;
    
    if (cached && (Date.now() - cached.cachedAt.getTime()) < cacheExpiryMs) {
      marketCatalogue = cached.catalogue;
    } else {
      // Fetch from API
      const catalogueResponse = await listMarketCatalogue(
        state.config.enrichment.apiState,
        { marketIds: [marketId] },
        ['COMPETITION', 'EVENT', 'EVENT_TYPE', 'MARKET_DESCRIPTION', 'RUNNER_DESCRIPTION', 'RUNNER_METADATA'],
        MarketSort.FIRST_TO_START,
        1 // maxResults
      );
      
      if (catalogueResponse.data?.result && catalogueResponse.data.result.length > 0) {
        marketCatalogue = catalogueResponse.data.result[0];
        
        // Cache the result if we have valid data
        if (marketCatalogue) {
          state.enrichmentCache.set(marketId, {
            catalogue: marketCatalogue,
            cachedAt: new Date()
          });
        }
      }
    }

    if (!marketCatalogue) {
      console.warn(`🔍 No market catalogue found for ${marketId}`);
      return basicRecord;
    }

    // Enrich market data
    const enrichedRecord: BasicMarketRecord = {
      ...basicRecord,
      marketName: marketCatalogue.marketName || basicRecord.marketName,
      eventName: marketCatalogue.event?.name || basicRecord.eventName,
      runners: basicRecord.runners.map(runner => {
        // Find matching runner in catalogue
        const catalogueRunner = marketCatalogue!.runners?.find((r: any) => r.selectionId === runner.id);
        
        return {
          ...runner,
          name: catalogueRunner?.runnerName || runner.name
        };
      })
    };

    console.log(`✨ Enriched market ${marketId}: "${enrichedRecord.marketName}" in "${enrichedRecord.eventName}"`);
    return enrichedRecord;

  } catch (error) {
    console.warn(`⚠️ Failed to enrich market ${marketId}:`, error);
    return basicRecord;
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
  
  // Create basic runner records first (without reconciliation)
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
      tv: runner.tv, // Will be updated by reconciliation if market complete
      spn: runner.spn,
      spf: runner.spf,
      finalStatus: runner.status,
      isWinner: runner.status === StreamRunnerStatus.WINNER,
    };
  });

  // NOW determine if market is truly complete using the actual runners
  const isComplete = isMarketTrulyComplete(marketDef, runners);

  // Apply reconciliation to runners if market is complete
  const reconciledRunners = runners.map(runner => {
    const runnerCache = Object.values(marketCache.runners).find(r => r.id === runner.id);
    return runnerCache ? reconcileRunnerData(runner, runnerCache, isComplete) : runner;
  });

  // Calculate market-level reconciliation data
  let reconciliationData: Partial<BasicMarketRecord> = {};
  if (isComplete) {
    const calculatedTotalTurnover = reconciledRunners.reduce((sum, runner) => 
      sum + (runner.totalTurnover || 0), 0
    );
    
    const totalUniquePrice = reconciledRunners.reduce((sum, runner) => 
      sum + (runner.priceRange?.trades || 0), 0
    );

    const marketDepth = reconciledRunners.reduce((sum, runner) => 
      sum + (runner.reconciledVolume || runner.tv), 0
    );

    reconciliationData = {
      reconciled: true,
      reconciliationTime: new Date().toISOString(),
      calculatedTotalTurnover,
      liquidityProfile: {
        totalUniquePrice,
        marketDepth
      }
    };
  }

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
    complete: isComplete, // Use our corrected logic
    numberOfWinners: marketDef.numberOfWinners,
    runners: reconciledRunners, // Use reconciled runners
    recordedAt: new Date().toISOString(),
    finalTotalMatched: isComplete ? marketDef.totalMatched : undefined,
    winners: reconciledRunners.filter(r => r.isWinner).map(r => r.id),
    ...reconciliationData // Add reconciliation data if market complete
  };

  state.basicRecords.set(marketId, basicRecord);
  
  // If market is complete, enrich and save the record
  if (isComplete) {
    // Handle enrichment asynchronously
    const processCompletedMarket = async () => {
      try {
        // Enrich the record if enabled
        const enrichedRecord = await enrichMarketData(state, marketId, basicRecord);
        
        // Save the enriched record
        saveBasicRecord(state.config, enrichedRecord);
        
        // Update the stored record with enriched data
        state.basicRecords.set(marketId, enrichedRecord);
        
        // Mark market as completed
        if (!state.completedMarkets.has(marketId)) {
          state.completedMarkets.add(marketId);
          
          // Log completion with reconciliation info
          const totalTurnover = enrichedRecord.calculatedTotalTurnover;
          const marketDepth = enrichedRecord.liquidityProfile?.marketDepth;
          const reconciliationMsg = totalTurnover && marketDepth 
            ? ` (reconciled: £${totalTurnover.toFixed(2)} turnover, ${marketDepth.toFixed(0)} volume)`
            : '';
          
          console.log(`🏁 Market "${enrichedRecord.marketName}" completed and recorded${reconciliationMsg}`);
          
          // Check if all finite markets are complete
          checkAllMarketsComplete(state);
        }
      } catch (error) {
        console.error(`❌ Error processing completed market ${marketId}:`, error);
        
        // Fallback: save without enrichment
        saveBasicRecord(state.config, basicRecord);
        
        if (!state.completedMarkets.has(marketId)) {
          state.completedMarkets.add(marketId);
          checkAllMarketsComplete(state);
        }
      }
    };
    
    // Execute async processing
    processCompletedMarket();
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