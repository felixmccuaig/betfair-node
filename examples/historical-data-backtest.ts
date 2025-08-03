import * as fs from 'fs';
import * as readline from 'readline';
import * as path from 'path';
import {
  createStreamDecoderState,
  processDataPacket,
  StreamDecoderCallbacks,
} from '../src/betfair-stream-decoder';
import {
  createMarketRecorderState,
  updateBasicRecord,
  MarketRecordingConfig,
  getRecordingCompletionStatus,
} from '../src/market-recorder';
import { MarketCache, CurrencyRate } from '../src/betfair-exchange-stream-api-types';

interface BacktestConfig {
  inputFile: string;
  outputDirectory: string;
  currencyCode: string;
  currencyRate: number;
  enableVerboseLogging?: boolean;
  generateSummaryReport?: boolean;
}

interface BacktestSummary {
  fileName: string;
  totalMessages: number;
  processingTimeMs: number;
  marketsProcessed: number;
  completedMarkets: number;
  marketSummaries: MarketSummary[];
  overallStats: {
    totalVolumeTraded: number;
    totalTurnover: number;
    averageMarketDepth: number;
    uniquePricesTraded: number;
  };
}

interface MarketSummary {
  marketId: string;
  marketName: string;
  eventName: string;
  marketStatus: string;
  totalMatched: number;
  numberOfRunners: number;
  winners: number[];
  bspReconciled: boolean;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  runnerSummaries: RunnerSummary[];
}

interface RunnerSummary {
  id: number;
  name: string;
  status: string;
  isWinner: boolean;
  finalPrice?: number;
  bsp?: number;
  totalVolume: number;
  totalTurnover: number;
  priceRange?: {
    highest: number;
    lowest: number;
    trades: number;
  };
  volumeWeightedPrice: number;
}

/**
 * Processes historical market data file and generates summary statistics
 */
async function backtestHistoricalData(config: BacktestConfig): Promise<BacktestSummary> {
  console.log(`🔄 Starting backtest analysis of: ${config.inputFile}`);
  const startTime = Date.now();

  // Check if input file exists
  if (!fs.existsSync(config.inputFile)) {
    throw new Error(`Input file not found: ${config.inputFile}`);
  }

  // Ensure output directory exists
  if (!fs.existsSync(config.outputDirectory)) {
    fs.mkdirSync(config.outputDirectory, { recursive: true });
  }

  // Initialize decoder state
  const currencyRate: CurrencyRate = {
    currencyCode: config.currencyCode,
    rate: config.currencyRate,
  };

  let decoderState = createStreamDecoderState(currencyRate);
  
  // Initialize recorder for capturing statistics  
  const recordingConfig: MarketRecordingConfig = {
    outputDirectory: config.outputDirectory,
    enableBasicRecording: true,
    enableRawRecording: false, // We already have the raw data
    basicFilePrefix: 'backtest_',
    recordingMode: 'finite',
  };

  let recorderState = createMarketRecorderState(recordingConfig);
  
  // Start recording - this is needed for updateBasicRecord to work
  recorderState.isRecording = true;
  
  // Statistics tracking
  let totalMessages = 0;
  let lastLogTime = Date.now();
  const processedMarkets = new Set<string>();
  const marketStartTimes = new Map<string, Date>();
  const marketEndTimes = new Map<string, Date>();

  // Create decoder callbacks
  const callbacks: StreamDecoderCallbacks = {
    onMarketChange: (marketCache: { [key: string]: MarketCache }, deltas: string[]) => {
      // Track markets and timing
      Object.keys(marketCache).forEach(marketId => {
        if (!processedMarkets.has(marketId)) {
          processedMarkets.add(marketId);
          marketStartTimes.set(marketId, new Date());
          if (config.enableVerboseLogging) {
            console.log(`📊 Started processing market: ${marketId}`);
          }
        }

        // Update basic records using the market recorder
        const market = marketCache[marketId];
        if (market) {
          // Market processing without debug output
          updateBasicRecord(recorderState, market);
        }
        
        // Check if market completed
        const basicRecord = recorderState.basicRecords.get(marketId);
        if (basicRecord?.complete && !marketEndTimes.has(marketId)) {
          marketEndTimes.set(marketId, new Date());
          if (config.enableVerboseLogging) {
            console.log(`✅ Market completed: ${basicRecord.marketName} (${marketId})`);
          }
        }
      });

      // Progress logging every 10 seconds
      const now = Date.now();
      if (now - lastLogTime > 10000) {
        console.log(`📈 Processed ${totalMessages} messages, ${processedMarkets.size} markets`);
        lastLogTime = now;
      }
    },
    onStatus: (statusMessage) => {
      if (config.enableVerboseLogging) {
        console.log(`📡 Status: ${statusMessage.statusCode} - ${statusMessage.connectionClosed ? 'Closed' : 'Open'}`);
      }
    },
    onConnection: (connectionMessage) => {
      if (config.enableVerboseLogging) {
        console.log(`🔗 Connection: ${connectionMessage.connectionId}`);
      }
    },
    onHeartbeat: () => {
      // Silent heartbeat handling
    },
  };

  // Process file line by line
  const fileStream = fs.createReadStream(config.inputFile);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  console.log(`📖 Reading historical data...`);

  for await (const line of rl) {
    if (line.trim()) {
      try {
        totalMessages++;
        decoderState = processDataPacket(decoderState, callbacks, line.trim());
      } catch (error) {
        console.error(`❌ Error processing line ${totalMessages}:`, error);
        if (config.enableVerboseLogging) {
          console.error(`📄 Problematic line: ${line.substring(0, 200)}...`);
        }
      }
    }
  }

  const processingTimeMs = Date.now() - startTime;
  console.log(`✅ Completed processing ${totalMessages} messages in ${processingTimeMs}ms`);

  // Generate summary
  const summary = generateBacktestSummary(
    config,
    recorderState,
    totalMessages,
    processingTimeMs,
    marketStartTimes,
    marketEndTimes
  );

  // Save summary report if requested
  if (config.generateSummaryReport) {
    const summaryPath = path.join(config.outputDirectory, 'backtest_summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(`📊 Summary report saved to: ${summaryPath}`);
  }

  return summary;
}

/**
 * Generates comprehensive backtest summary
 */
function generateBacktestSummary(
  config: BacktestConfig,
  recorderState: any,
  totalMessages: number,
  processingTimeMs: number,
  marketStartTimes: Map<string, Date>,
  marketEndTimes: Map<string, Date>
): BacktestSummary {
  
  const marketSummaries: MarketSummary[] = [];
  let totalVolumeTraded = 0;
  let totalTurnover = 0;
  let totalMarketDepth = 0;
  let totalUniquePrices = 0;

  // Process each market's basic record
  for (const [marketId, basicRecord] of recorderState.basicRecords) {
    const startTime = marketStartTimes.get(marketId);
    const endTime = marketEndTimes.get(marketId) || new Date();
    const durationMinutes = startTime ? (endTime.getTime() - startTime.getTime()) / (1000 * 60) : 0;

    // Process runners
    const runnerSummaries: RunnerSummary[] = basicRecord.runners.map((runner: any) => ({
      id: runner.id,
      name: runner.name,
      status: runner.status,
      isWinner: runner.isWinner,
      finalPrice: runner.ltp > 0 ? runner.ltp : undefined,
      bsp: runner.bsp,
      totalVolume: runner.reconciledVolume || runner.tv,
      totalTurnover: runner.totalTurnover || 0,
      priceRange: runner.priceRange,
      volumeWeightedPrice: runner.volumeWeightedPrice || 0,
    }));

    // Calculate market-level statistics
    const marketVolume = runnerSummaries.reduce((sum, r) => sum + r.totalVolume, 0);
    const marketTurnover = runnerSummaries.reduce((sum, r) => sum + r.totalTurnover, 0);
    const uniquePrices = runnerSummaries.reduce((sum, r) => sum + (r.priceRange?.trades || 0), 0);

    totalVolumeTraded += marketVolume;
    totalTurnover += marketTurnover;
    totalMarketDepth += marketVolume;
    totalUniquePrices += uniquePrices;

    const marketSummary: MarketSummary = {
      marketId,
      marketName: basicRecord.marketName,
      eventName: basicRecord.eventName,
      marketStatus: basicRecord.marketStatus,
      totalMatched: basicRecord.totalMatched,
      numberOfRunners: basicRecord.runners.length,
      winners: basicRecord.winners || [],
      bspReconciled: basicRecord.bspReconciled,
      startTime: startTime?.toISOString() || '',
      endTime: endTime.toISOString(),
      durationMinutes: Math.round(durationMinutes * 100) / 100,
      runnerSummaries,
    };

    marketSummaries.push(marketSummary);
  }

  const completionStatus = getRecordingCompletionStatus(recorderState);
  const averageMarketDepth = marketSummaries.length > 0 ? totalMarketDepth / marketSummaries.length : 0;

  return {
    fileName: path.basename(config.inputFile),
    totalMessages,
    processingTimeMs,
    marketsProcessed: marketSummaries.length,
    completedMarkets: completionStatus.completedMarkets,
    marketSummaries,
    overallStats: {
      totalVolumeTraded,
      totalTurnover,
      averageMarketDepth,
      uniquePricesTraded: totalUniquePrices,
    },
  };
}

/**
 * Example usage function
 */
async function runBacktestExample() {
  const config: BacktestConfig = {
    inputFile: './examples/1.216777904', // Your historical data file
    outputDirectory: './backtest_results',
    currencyCode: 'AUD',
    currencyRate: 1.0,
    enableVerboseLogging: false, // Set to true for detailed logging
    generateSummaryReport: true,
  };

  try {
    console.log('🏇 Historical Data Backtest Example');
    console.log('====================================');
    
    const summary = await backtestHistoricalData(config);
    
    console.log('\n📊 BACKTEST RESULTS');
    console.log('===================');
    console.log(`📁 File: ${summary.fileName}`);
    console.log(`📬 Messages processed: ${summary.totalMessages.toLocaleString()}`);
    console.log(`⏱️  Processing time: ${summary.processingTimeMs}ms`);
    console.log(`🏁 Markets processed: ${summary.marketsProcessed}`);
    console.log(`✅ Markets completed: ${summary.completedMarkets}`);
    
    console.log('\n💰 OVERALL STATISTICS');
    console.log('=====================');
    console.log(`📈 Total volume traded: ${summary.overallStats.totalVolumeTraded.toLocaleString()}`);
    console.log(`💵 Total turnover: ${summary.overallStats.totalTurnover.toFixed(2)}`);
    console.log(`📊 Average market depth: ${summary.overallStats.averageMarketDepth.toFixed(2)}`);
    console.log(`🎯 Unique prices traded: ${summary.overallStats.uniquePricesTraded}`);

    console.log('\n🏆 MARKET SUMMARIES');
    console.log('==================');
    summary.marketSummaries.forEach((market, index) => {
      console.log(`\n${index + 1}. ${market.marketName}`);
      console.log(`   Event: ${market.eventName}`);
      console.log(`   Market ID: ${market.marketId}`);
      console.log(`   Status: ${market.marketStatus}`);
      console.log(`   Duration: ${market.durationMinutes} minutes`);
      console.log(`   Runners: ${market.numberOfRunners}`);
      console.log(`   Total Matched: ${market.totalMatched.toLocaleString()}`);
      console.log(`   Winners: ${market.winners.length > 0 ? market.winners.join(', ') : 'None yet'}`);
      console.log(`   BSP Reconciled: ${market.bspReconciled ? 'Yes' : 'No'}`);
      
      // Show top runners by volume
      const topRunners = market.runnerSummaries
        .sort((a, b) => b.totalVolume - a.totalVolume)
        .slice(0, 3);
        
      console.log(`   Top Runners by Volume:`);
      topRunners.forEach((runner, idx) => {
        const status = runner.isWinner ? '🏆' : runner.finalPrice ? '💰' : '📊';
        console.log(`     ${idx + 1}. ${status} ${runner.name} - Vol: ${runner.totalVolume.toFixed(0)} | Price: ${runner.finalPrice || 'N/A'}`);
      });
    });

    console.log(`\n✅ Backtest complete! Results saved to: ${config.outputDirectory}`);
    
  } catch (error) {
    console.error('❌ Backtest failed:', error);
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  runBacktestExample().catch(console.error);
}

export { backtestHistoricalData, BacktestConfig, BacktestSummary };