import * as dotenv from 'dotenv';
import {
  createBetfairApiState,
  login,
  listMarketCatalogue,
  createAndConnectRecordingStream,
  subscribeToMarkets,
  closeStream,
  createMarketRecorderState,
  startRecording,
  stopRecording,
  createRecordingMarketChangeCallback,
  createRawDataCallback,
  getRecordingStatus,
  getRecordingCompletionStatus,
  MarketRecordingConfig,
  MarketSort,
} from '../src/index';

// Load environment variables
dotenv.config();

const USERNAME = process.env.BETFAIR_USERNAME!;
const PASSWORD = process.env.BETFAIR_PASSWORD!;
const APP_KEY = process.env.BETFAIR_APP_KEY!;

if (!USERNAME || !PASSWORD || !APP_KEY) {
  console.error('Please set BETFAIR_USERNAME, BETFAIR_PASSWORD, and BETFAIR_APP_KEY in your .env file');
  process.exit(1);
}

interface MarketInfo {
  marketId: string;
  marketName: string;
  eventName: string;
}

async function recordMarketData() {
  console.log('🏇 Starting Market Recorder Example');

  try {
    // 1. Initialize Betfair API
    let apiState = createBetfairApiState(
      'en',              // locale
      'AUD',             // currencyCode  
      250,               // conflateMs
      5000,              // heartbeatMs
      () => {}           // marketChangeCallback (placeholder)
    );
    apiState = await login(apiState, APP_KEY, USERNAME, PASSWORD);
    
    console.log('✅ Logged in successfully');

    // 2. Set up market recording configuration
    let streamState: any;
    let recorderState: any;
    
    const recordingConfig: MarketRecordingConfig = {
      outputDirectory: './recordings',
      enableBasicRecording: true,
      enableRawRecording: true,
      rawFilePrefix: 'raw_',
      basicFilePrefix: 'basic_',
      recordingMode: 'finite', // Stop when all markets complete
      onAllMarketsComplete: () => {
        console.log('🛑 All markets completed - stopping recording...');
        recorderState = stopRecording(recorderState);
        streamState = closeStream(streamState);
        console.log('✅ Recording complete! Check ./recordings/ directory for files');
        process.exit(0);
      }
    };

    // 3. Initialize market recorder
    recorderState = createMarketRecorderState(recordingConfig);
    console.log('✅ Market recorder initialized');

    // 4. Find some markets to record (example: next few horse racing markets)
    const marketsResponse = await listMarketCatalogue(
      apiState,
      {
        eventTypeIds: ['7'], // Horse Racing
        marketCountries: ['GB'],
        marketTypeCodes: ['WIN'],
        marketStartTime: {
          from: new Date().toISOString(),
          to: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // Next 2 hours
        },
      },
      ['COMPETITION', 'EVENT', 'EVENT_TYPE', 'MARKET_DESCRIPTION', 'RUNNER_DESCRIPTION'],
      MarketSort.FIRST_TO_START,
      3
    );

    const markets = marketsResponse.data.result || [];
    if (markets.length === 0) {
      console.log('❌ No markets found');
      return;
    }

    const marketInfos: MarketInfo[] = markets.map((market: any) => ({
      marketId: market.marketId,
      marketName: market.marketName,
      eventName: market.event?.name || 'Unknown Event',
    }));

    console.log('📊 Found markets to record:');
    marketInfos.forEach((market, index) => {
      console.log(`  ${index + 1}. ${market.eventName} - ${market.marketName} (${market.marketId})`);
    });

    // 5. Start recording
    const marketIds = marketInfos.map(m => m.marketId);
    recorderState = startRecording(recorderState, marketIds);
    console.log('🎬 Recording started');

    // 6. Create recording callbacks
    const rawDataCallback = createRawDataCallback(recorderState);
    
    // Pure recording callback - no logging to keep it truly "raw"
    const marketChangeCallback = createRecordingMarketChangeCallback(recorderState);

    // 7. Connect to stream and subscribe to markets
    if (!apiState.sessionKey) {
      throw new Error('Session key not available after login');
    }

    streamState = await createAndConnectRecordingStream(
      apiState.sessionKey,
      APP_KEY,
      false, // segmentationEnabled
      250,   // conflateMs
      { currencyCode: 'AUD', rate: 1.0 },
      marketChangeCallback,
      rawDataCallback // Raw data callback for recording raw transmissions
    );

    streamState = subscribeToMarkets(streamState, marketIds);
    console.log('🔗 Connected to stream and subscribed to markets');

    // 8. Show recording status
    marketIds.forEach(marketId => {
      const status = getRecordingStatus(recorderState, marketId);
      console.log(`📝 Recording Status for ${marketId}:`);
      console.log(`  - Raw Stream Active: ${status.hasRawStream}`);
      console.log(`  - Basic Record Active: ${status.hasBasicRecord}`);
      if (status.rawFilePath) console.log(`  - Raw File: ${status.rawFilePath}`);
      if (status.basicFilePath) console.log(`  - Basic File: ${status.basicFilePath}`);
    });

    // 9. Monitor recording progress until all markets complete
    const status = getRecordingCompletionStatus(recorderState);
    console.log(`⏱️  Recording ${status.totalMarkets} markets in ${status.recordingMode} mode...`);
    console.log(`📊 Markets: ${status.completedMarkets} completed, ${status.pendingMarkets.length} pending`);
    console.log('🔇 Silent recording mode - will stop automatically when all markets complete');

    // Show periodic status updates
    const statusInterval = setInterval(() => {
      const currentStatus = getRecordingCompletionStatus(recorderState);
      if (currentStatus.completedMarkets !== status.completedMarkets) {
        console.log(`📊 Progress: ${currentStatus.completedMarkets}/${currentStatus.totalMarkets} markets completed`);
        if (currentStatus.pendingMarkets.length > 0 && currentStatus.pendingMarkets.length <= 5) {
          console.log(`⏳ Waiting for: ${currentStatus.pendingMarkets.join(', ')}`);
        }
      }
    }, 30000); // Update every 30 seconds

    // The recording will automatically stop via the onAllMarketsComplete callback
    // Keep the process alive
    process.on('SIGINT', () => {
      console.log('\n🛑 Manual stop requested...');
      clearInterval(statusInterval);
      recorderState = stopRecording(recorderState);
      streamState = closeStream(streamState);
      console.log('✅ Recording stopped');
      process.exit(0);
    });

    // Recording will continue until all markets complete
    // Process will exit automatically via onAllMarketsComplete callback

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down gracefully...');
  process.exit(0);
});

// Run the example
recordMarketData().catch(console.error);