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

async function simpleRecordingExample() {
  console.log('🎬 Simple Market Recording Example');

  try {
    // 1. Login to Betfair
    let apiState = createBetfairApiState('en', 'AUD', 250, 5000, () => {});
    apiState = await login(apiState, APP_KEY, USERNAME, PASSWORD);
    console.log('✅ Logged in successfully');

    // 2. Configure recording (both types enabled)
    const recordingConfig: MarketRecordingConfig = {
      outputDirectory: './recordings',
      enableBasicRecording: true,   // Store structured market data (BSP, winners, etc.)
      enableRawRecording: true,     // Store raw transmissions line by line
      rawFilePrefix: '',            // Files will be named like "1.123456789.txt"
      basicFilePrefix: 'basic_',    // Files will be named like "basic_1.123456789.json"
    };

    // 3. Initialize recorder
    let recorderState = createMarketRecorderState(recordingConfig);
    console.log('📝 Market recorder initialized');

    // 4. Get some markets to record
    const marketsResponse = await listMarketCatalogue(
      apiState,
      {
        eventTypeIds: ['7'], // Horse Racing
        marketCountries: ['AU'],
        marketTypeCodes: ['WIN'],
        marketStartTime: {
          from: new Date().toISOString(),
          to: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
        },
      },
      ['COMPETITION', 'EVENT', 'EVENT_TYPE', 'MARKET_DESCRIPTION'],
      MarketSort.FIRST_TO_START,
      2 // Just record 2 markets
    );

    const markets = marketsResponse.data.result || [];
    if (markets.length === 0) {
      console.log('❌ No markets found');
      return;
    }

    const marketIds = markets.map((m: any) => m.marketId);
    console.log(`📊 Found ${markets.length} markets to record:`, marketIds);

    // 5. Start recording
    recorderState = startRecording(recorderState, marketIds);
    console.log('🎬 Recording started');

    // 6. Create callbacks
    const rawDataCallback = createRawDataCallback(recorderState);
    // Pure recording callback - no processing/logging to keep it truly "raw"
    const marketChangeCallback = createRecordingMarketChangeCallback(recorderState);

    // 7. Connect to stream
    if (!apiState.sessionKey) {
      throw new Error('Session key not available');
    }

    let streamState = await createAndConnectRecordingStream(
      apiState.sessionKey,
      APP_KEY,
      false, // segmentationEnabled
      250,   // conflateMs
      { currencyCode: 'AUD', rate: 1.0 },
      marketChangeCallback,
      rawDataCallback  // This captures raw data directly from TLS stream!
    );

    streamState = subscribeToMarkets(streamState, marketIds);
    console.log('🔗 Connected and subscribed to markets');

    // 8. Record for 30 seconds
    console.log('⏱️  Recording for 30 seconds...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // 9. Stop recording
    console.log('🛑 Stopping recording...');
    recorderState = stopRecording(recorderState);
    streamState = closeStream(streamState);

    console.log('✅ Recording complete! Check ./recordings/ directory for files:');
    marketIds.forEach(marketId => {
      console.log(`  - ${marketId}.txt (raw transmissions)`);
      console.log(`  - basic_${marketId}.json (structured data)`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  process.exit(0);
});

// Run the example
simpleRecordingExample().catch(console.error);