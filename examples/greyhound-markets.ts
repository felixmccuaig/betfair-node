/**
 * Example: List Australian Greyhound Markets between 5pm-7pm
 * 
 * Create a .env file in the project root with:
 * BETFAIR_APP_KEY=your_application_key_here
 * BETFAIR_USERNAME=your_username_here
 * BETFAIR_PASSWORD=your_password_here
 * TIMEZONE=Australia/Sydney
 * LOCALE=en
 * CURRENCY=AUD
 */

import * as dotenv from 'dotenv';
import {
  createBetfairApiState,
  login,
  listMarketCatalogue,
  findCurrencyRate,
} from "../src/betfair-api";

import {
  MarketFilter,
  MarketSort,
  MarketProjection,
  MarketCatalogue,
  RunnerCatalogue,
} from "../src/betfair-api-types";

// Load environment variables
dotenv.config();

interface GreyhoundMarket {
  marketId: string;
  marketName: string;
  venue: string;
  startTime: string;
  countryCode: string;
  raceNumber?: string;
  totalMatched: number;
  runners: Array<{
    selectionId: number;
    runnerName: string;
    handicap: number;
  }>;
}

async function listGreyhoundMarkets(): Promise<void> {
  // Validate environment variables
  const appKey = process.env.BETFAIR_APP_KEY;
  const username = process.env.BETFAIR_USERNAME;
  const password = process.env.BETFAIR_PASSWORD;
  const timezone = process.env.TIMEZONE || 'Australia/Sydney';
  const locale = process.env.LOCALE || 'en';
  const currency = process.env.CURRENCY || 'AUD';

  if (!appKey || !username || !password) {
    console.error('❌ Missing required environment variables:');
    console.error('   BETFAIR_APP_KEY, BETFAIR_USERNAME, BETFAIR_PASSWORD');
    console.error('\n📝 Create a .env file with your Betfair credentials');
    process.exit(1);
  }

  try {
    console.log('🐕 Australian Greyhound Markets (5pm-7pm)');
    console.log('==========================================\n');

    // Create initial API state
    let apiState = createBetfairApiState(
      locale,
      currency,
      500,    // conflateMs
      5000,   // heartbeatMs
      () => {} // marketChangeCallback (not used in this example)
    );

    // Login to Betfair
    console.log('🔐 Logging in to Betfair...');
    apiState = await login(apiState, appKey, username, password);
    console.log('✅ Successfully authenticated\n');

    // Get current date and calculate time range (5pm-7pm in specified timezone)
    const now = new Date();
    const today = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
    
    // Set to 5pm today
    const startTime = new Date(today);
    startTime.setHours(17, 0, 0, 0);
    
    // Set to 7pm today
    const endTime = new Date(today);
    endTime.setHours(19, 0, 0, 0);

    // If it's already past 7pm, look at tomorrow
    if (now > endTime) {
      startTime.setDate(startTime.getDate() + 1);
      endTime.setDate(endTime.getDate() + 1);
    }

    console.log(`📅 Searching for markets from ${startTime.toLocaleString()} to ${endTime.toLocaleString()}\n`);

    // Create market filter for Australian greyhound racing
    const marketFilter: MarketFilter = {
      eventTypeIds: ['4339'], // Greyhound Racing
      marketCountries: ['AU'], // Australia
      marketStartTime: {
        from: startTime.toISOString(),
        to: endTime.toISOString(),
      },
      marketTypeCodes: ['WIN'], // Win markets only
    };

    // List market catalogue
    console.log('🔍 Fetching greyhound markets...');
    const catalogueResponse = await listMarketCatalogue(
      apiState,
      marketFilter,
      [
        MarketProjection.COMPETITION,
        MarketProjection.EVENT,
        MarketProjection.EVENT_TYPE,
        MarketProjection.MARKET_START_TIME,
        MarketProjection.RUNNER_DESCRIPTION,
      ],
      MarketSort.FIRST_TO_START,
      100 // Max results
    );

    const markets = catalogueResponse.data.result;
    console.log(`✅ Found ${markets.length} greyhound markets\n`);

    if (markets.length === 0) {
      console.log('😔 No greyhound markets found in the specified time range');
      console.log('💡 Try adjusting the time range or check if markets are available');
      return;
    }

    // Process and display markets
    const greyhoundMarkets: GreyhoundMarket[] = markets.map((market: MarketCatalogue) => {
      // Extract race number from market name if available
      const raceMatch = market.marketName?.match(/Race (\d+)/i);
      const raceNumber = raceMatch ? raceMatch[1] : undefined;

      return {
        marketId: market.marketId || '',
        marketName: market.marketName || 'Unknown Market',
        venue: market.event?.venue || market.competition?.name || 'Unknown Venue',
        startTime: market.marketStartTime || '',
        countryCode: market.event?.countryCode || 'AU',
        raceNumber,
        totalMatched: market.totalMatched || 0,
        runners: market.runners?.map((runner: RunnerCatalogue) => ({
          selectionId: runner.selectionId || 0,
          runnerName: runner.runnerName || 'Unknown Runner',
          handicap: runner.handicap || 0,
        })) || [],
      };
    });

    // Sort by start time
    greyhoundMarkets.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    // Display results in a nice format
    console.log('🏁 GREYHOUND MARKETS');
    console.log('====================\n');

    greyhoundMarkets.forEach((market, index) => {
      const startTime = new Date(market.startTime);
      const timeStr = startTime.toLocaleTimeString('en-AU', { 
        hour: '2-digit', 
        minute: '2-digit',
        timeZone: timezone 
      });
      
      console.log(`${index + 1}. ${market.venue}${market.raceNumber ? ` - Race ${market.raceNumber}` : ''}`);
      console.log(`   📍 Market: ${market.marketName}`);
      console.log(`   🕐 Start: ${timeStr} (${startTime.toLocaleDateString('en-AU')})`);
      console.log(`   💰 Matched: $${market.totalMatched.toLocaleString()}`);
      console.log(`   🆔 Market ID: ${market.marketId}`);
      
      if (market.runners.length > 0) {
        console.log(`   🐕 Runners (${market.runners.length}):`);
        market.runners.slice(0, 8).forEach((runner, runnerIndex) => {
          console.log(`      ${runnerIndex + 1}. ${runner.runnerName}${runner.handicap !== 0 ? ` (${runner.handicap > 0 ? '+' : ''}${runner.handicap})` : ''}`);
        });
        if (market.runners.length > 8) {
          console.log(`      ... and ${market.runners.length - 8} more`);
        }
      }
      
      console.log(''); // Empty line for spacing
    });

    // Summary statistics
    const totalMatched = greyhoundMarkets.reduce((sum, market) => sum + market.totalMatched, 0);
    const venues = Array.from(new Set(greyhoundMarkets.map(m => m.venue)));
    
    console.log('📊 SUMMARY');
    console.log('===========');
    console.log(`🏁 Total Markets: ${greyhoundMarkets.length}`);
    console.log(`🏟️  Unique Venues: ${venues.length}`);
    console.log(`💰 Total Matched: $${totalMatched.toLocaleString()}`);
    
    if (venues.length > 0) {
      console.log(`📍 Venues: ${venues.join(', ')}`);
    }

    // Show currency conversion if not AUD
    if (currency !== 'AUD' && apiState.currencyRates) {
      const currencyRate = findCurrencyRate(apiState.currencyRates, currency);
      if (currencyRate) {
        const convertedTotal = totalMatched * currencyRate.rate;
        console.log(`💱 Total Matched (${currency}): ${currencyRate.currencyCode}${convertedTotal.toLocaleString()}`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('INVALID_APP_KEY')) {
        console.error('🔑 Invalid application key. Check your BETFAIR_APP_KEY in .env');
      } else if (error.message.includes('INVALID_USERNAME_OR_PASSWORD')) {
        console.error('👤 Invalid credentials. Check your BETFAIR_USERNAME and BETFAIR_PASSWORD in .env');
      } else if (error.message.includes('API_ERROR')) {
        console.error('🌐 Betfair API error. Please try again later.');
      }
    }
    
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  listGreyhoundMarkets()
    .then(() => {
      console.log('\n✅ Completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Failed:', error);
      process.exit(1);
    });
}

export { listGreyhoundMarkets };