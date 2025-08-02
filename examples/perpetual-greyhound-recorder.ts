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
  addMarketsToRecording,
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

async function perpetualGreyhoundRecorder() {
  console.log('🐕 Perpetual Greyhound Market Recorder');
  console.log('This will continuously record ALL greyhound markets as they become available');
  console.log('Press Ctrl+C to stop');

  let streamState: any;
  let recorderState: any;

  try {
    // 1. Login to Betfair
    let apiState = createBetfairApiState('en', 'AUD', 250, 5000, () => {});
    apiState = await login(apiState, APP_KEY, USERNAME, PASSWORD);
    console.log('✅ Logged in successfully');

    // 2. Configure perpetual recording
    const recordingConfig: MarketRecordingConfig = {
      outputDirectory: './recordings/greyhounds',
      enableBasicRecording: true,
      enableRawRecording: true,
      rawFilePrefix: 'raw_',
      basicFilePrefix: 'basic_',
      recordingMode: 'perpetual', // Never stop automatically
    };

    // 3. Initialize recorder
    recorderState = createMarketRecorderState(recordingConfig);
    console.log('📝 Perpetual greyhound recorder initialized');

    // 4. Create recording callbacks
    const rawDataCallback = createRawDataCallback(recorderState);
    const marketChangeCallback = createRecordingMarketChangeCallback(recorderState);

    // 5. Connect to stream
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

    console.log('🔗 Connected to stream');

    // 6. Function to find and subscribe to new greyhound markets
    const findAndSubscribeToNewMarkets = async () => {
      try {
        const marketsResponse = await listMarketCatalogue(
          apiState,
          {
            eventTypeIds: ['4339'], // Greyhound Racing
            marketCountries: ['AU', 'GB', 'IE', 'US'], // Multiple countries
            marketTypeCodes: ['WIN'],
            marketStartTime: {
              from: new Date().toISOString(),
              to: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(), // Next 4 hours
            },
          },
          ['EVENT', 'EVENT_TYPE', 'MARKET_DESCRIPTION'],
          MarketSort.FIRST_TO_START,
          20 // Get up to 20 markets
        );

        const markets = marketsResponse.data.result || [];
        if (markets.length === 0) {
          console.log('🔍 No new greyhound markets found');
          return;
        }

        // Filter out markets we're already recording
        const newMarketIds = markets
          .map((m: any) => m.marketId)
          .filter((id: string) => !recorderState.subscribedMarkets.has(id));

        if (newMarketIds.length === 0) {
          console.log('🔍 No new markets to add (already recording all available)');
          return;
        }

        console.log(`🐕 Found ${newMarketIds.length} new greyhound markets:`);
        markets
          .filter((m: any) => newMarketIds.includes(m.marketId))
          .forEach((market: any) => {
            const startTime = new Date(market.marketStartTime).toLocaleString();
            console.log(`  📅 ${market.event?.name} - ${market.marketName} (${startTime})`);
          });

        // Add new markets to recording
        recorderState = addMarketsToRecording(recorderState, newMarketIds);
        
        // Subscribe to the new markets
        streamState = subscribeToMarkets(streamState, newMarketIds);
        
        console.log(`✅ Now recording ${recorderState.subscribedMarkets.size} total markets`);

      } catch (error) {
        console.error('❌ Error finding new markets:', error);
      }
    };

    // 7. Start with initial markets
    await findAndSubscribeToNewMarkets();

    // 8. Set up interval to find new markets every 5 minutes
    console.log('🔄 Setting up automatic market discovery (every 5 minutes)');
    const marketDiscoveryInterval = setInterval(findAndSubscribeToNewMarkets, 5 * 60 * 1000);

    // 9. Set up periodic status reporting
    const statusInterval = setInterval(() => {
      const status = getRecordingCompletionStatus(recorderState);
      console.log(`📊 Recording Status: ${status.totalMarkets} total markets, ${status.completedMarkets} completed`);
      
      if (status.pendingMarkets.length > 0) {
        const nextFew = status.pendingMarkets.slice(0, 3);
        console.log(`⏳ Active markets: ${nextFew.join(', ')}${status.pendingMarkets.length > 3 ? ` +${status.pendingMarkets.length - 3} more` : ''}`);
      }
    }, 2 * 60 * 1000); // Every 2 minutes

    // 10. Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Stopping perpetual recording...');
      clearInterval(marketDiscoveryInterval);
      clearInterval(statusInterval);
      
      const finalStatus = getRecordingCompletionStatus(recorderState);
      console.log(`📊 Final Stats: Recorded ${finalStatus.totalMarkets} markets, ${finalStatus.completedMarkets} completed`);
      
      recorderState = stopRecording(recorderState);
      streamState = closeStream(streamState);
      console.log('✅ Perpetual recording stopped');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 Received SIGTERM - stopping...');
      clearInterval(marketDiscoveryInterval);
      clearInterval(statusInterval);
      recorderState = stopRecording(recorderState);
      streamState = closeStream(streamState);
      process.exit(0);
    });

    console.log('🏃 Perpetual recording is now running...');
    console.log('📁 Files will be saved to: ./recordings/greyhounds/');
    console.log('🛑 Press Ctrl+C to stop');

  } catch (error) {
    console.error('❌ Error:', error);
    if (recorderState) recorderState = stopRecording(recorderState);
    if (streamState) streamState = closeStream(streamState);
    process.exit(1);
  }
}

// Run the perpetual recorder
perpetualGreyhoundRecorder().catch(console.error);