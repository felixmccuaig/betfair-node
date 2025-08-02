import * as dotenv from 'dotenv';
import {
  createBetfairApiState,
  login,
  createAndConnectRecordingStream,
  subscribeToMarkets,
  closeStream,
  createMarketRecorderState,
  startRecording,
  stopRecording,
  createRecordingMarketChangeCallback,
  createRawDataCallback,
  getRecordingCompletionStatus,
  MarketRecordingConfig,
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

async function recordSingleMarket() {
  // Get market ID from command line arguments
  const args = process.argv.slice(2);
  const marketId = args[0];

  if (!marketId) {
    console.error('❌ Please provide a market ID as an argument');
    console.log('Usage: npm run example:single-market 1.246191098');
    process.exit(1);
  }

  console.log(`🎯 Recording Single Market: ${marketId}`);

  let streamState: any;
  let recorderState: any;

  try {
    // 1. Login to Betfair
    let apiState = createBetfairApiState('en', 'AUD', 250, 5000, () => {});
    apiState = await login(apiState, APP_KEY, USERNAME, PASSWORD);
    console.log('✅ Logged in successfully');

    // 2. Configure recording for single market (finite mode)
    const recordingConfig: MarketRecordingConfig = {
      outputDirectory: './recordings',
      enableBasicRecording: true,
      enableRawRecording: true,
      rawFilePrefix: 'raw_',
      basicFilePrefix: 'basic_',
      recordingMode: 'finite', // Will stop when this market completes
      onAllMarketsComplete: () => {
        console.log(`✅ Market ${marketId} completed - stopping recording...`);
        recorderState = stopRecording(recorderState);
        streamState = closeStream(streamState);
        console.log('🎉 Recording complete! Files saved:');
        console.log(`  - raw_${marketId}.txt`);
        console.log(`  - basic_${marketId}.json`);
        process.exit(0);
      }
    };

    // 3. Initialize recorder
    recorderState = createMarketRecorderState(recordingConfig);
    console.log('📝 Market recorder initialized');

    // 4. Start recording for the specific market
    recorderState = startRecording(recorderState, [marketId]);
    console.log(`🎬 Started recording market: ${marketId}`);

    // 5. Create recording callbacks
    const rawDataCallback = createRawDataCallback(recorderState);
    const marketChangeCallback = createRecordingMarketChangeCallback(recorderState);

    // 6. Connect to stream
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
      rawDataCallback
    );

    // 7. Subscribe to the specific market
    streamState = subscribeToMarkets(streamState, [marketId]);
    console.log(`🔗 Connected and subscribed to market: ${marketId}`);

    // 8. Show status and wait for completion
    const status = getRecordingCompletionStatus(recorderState);
    console.log(`⏱️  Recording in ${status.recordingMode} mode...`);
    console.log('🔇 Will stop automatically when market completes');
    console.log('📁 Recording to: ./recordings/');

    // Handle manual stop
    process.on('SIGINT', () => {
      console.log('\n🛑 Manual stop requested...');
      recorderState = stopRecording(recorderState);
      streamState = closeStream(streamState);
      console.log('✅ Recording stopped');
      process.exit(0);
    });

    // Recording will continue until market completes
    // Process will exit automatically via onAllMarketsComplete callback

  } catch (error) {
    console.error('❌ Error:', error);
    if (recorderState) recorderState = stopRecording(recorderState);
    if (streamState) streamState = closeStream(streamState);
    process.exit(1);
  }
}

// Run the single market recorder
recordSingleMarket().catch(console.error);