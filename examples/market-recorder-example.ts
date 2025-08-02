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
    const recordingConfig: MarketRecordingConfig = {
      outputDirectory: './recordings',
      enableBasicRecording: true,
      enableRawRecording: true,
      rawFilePrefix: 'raw_',
      basicFilePrefix: 'basic_',
    };

    // 3. Initialize market recorder
    let recorderState = createMarketRecorderState(recordingConfig);
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

    let streamState = await createAndConnectRecordingStream(
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

    // 9. Record for a specified duration (example: 5 minutes)
    const recordingDurationMs = 5 * 60 * 1000; // 5 minutes
    console.log(`⏱️  Recording for ${recordingDurationMs / 1000} seconds...`);
    console.log('🔇 Silent recording mode - pure raw data capture without processing');

    await new Promise(resolve => setTimeout(resolve, recordingDurationMs));

    // 10. Stop recording and cleanup
    console.log('🛑 Stopping recording...');
    recorderState = stopRecording(recorderState);
    streamState = closeStream(streamState);

    console.log('✅ Recording stopped and files saved');

    // 11. Show final recording status
    console.log('\n📁 Final Recording Summary:');
    marketIds.forEach(marketId => {
      const status = getRecordingStatus(recorderState, marketId);
      const marketInfo = marketInfos.find(m => m.marketId === marketId);
      console.log(`\n📊 ${marketInfo?.eventName} - ${marketInfo?.marketName}`);
      console.log(`   Market ID: ${marketId}`);
      if (status.rawFilePath) console.log(`   Raw File: ${status.rawFilePath}`);
      if (status.basicFilePath) console.log(`   Basic File: ${status.basicFilePath}`);
    });

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