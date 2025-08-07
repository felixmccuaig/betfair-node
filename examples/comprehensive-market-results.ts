import { 
  createBetfairApiState, 
  login, 
  getComprehensiveMarketResults,
  ComprehensiveMarketResults 
} from '../src/index';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function demonstrateComprehensiveMarketResults() {
  // Create API state
  const apiState = createBetfairApiState(
    'en',
    'AUD',
    500,
    5000,
    (_marketCache, deltas) => console.log('Market update:', deltas.length)
  );

  try {
    // Get credentials from environment variables
    const appKey = process.env.BETFAIR_APP_KEY;
    const username = process.env.BETFAIR_USERNAME;
    const password = process.env.BETFAIR_PASSWORD;

    if (!appKey || !username || !password) {
      console.error('Error: Please set BETFAIR_APP_KEY, BETFAIR_USERNAME, and BETFAIR_PASSWORD environment variables');
      return;
    }

    // Login using environment variables
    const authenticatedState = await login(
      apiState,
      appKey,
      username,
      password
    );

    // Get market ID from command line args, env var, or default
    const args = process.argv.slice(2);
    const marketIdArg = args.find(arg => arg.startsWith('--market-id='));
    const marketId = marketIdArg 
      ? marketIdArg.split('=')[1] || '1.123456789'
      : process.env.BETFAIR_MARKET_ID || '1.123456789';
    
    if (marketId === '1.123456789') {
      console.log('Warning: Using placeholder market ID. Use --market-id=1.234567890 or set BETFAIR_MARKET_ID environment variable.');
    } else {
      console.log(`Using market ID: ${marketId}`);
    }
    
    const response = await getComprehensiveMarketResults(authenticatedState, marketId);
    const results: ComprehensiveMarketResults = response.data.result;

    console.log('=== Comprehensive Market Results ===');
    console.log(`Market: ${results.eventName} at ${results.venue}`);
    console.log(`Race Time: ${results.marketTime}`);
    console.log(`Status: ${results.marketStatus}`);
    console.log(`Total Matched: £${results.totalMatched.toLocaleString()}`);
    
    if (results.settledTime) {
      console.log(`Settled: ${results.settledTime}`);
    }

    console.log('\n=== Runner Results ===');
    Object.entries(results.runners).forEach(([selectionId, runner]) => {
      const selId = parseInt(selectionId);
      const result = results.result[selId];
      const bspPrice = results.bsp[selId];
      
      if (!result) {
        console.log(`${runner.name}: No result data found`);
        return;
      }
      
      console.log(`${runner.name}:`);
      console.log(`  Result: ${result.status}`);
      console.log(`  BSP: ${bspPrice && bspPrice > 0 ? bspPrice.toFixed(2) : 'N/A'}`);
      console.log(`  Volume Matched: £${runner.totalMatched.toLocaleString()}`);
      
      if (result.adjustmentFactor) {
        console.log(`  Adjustment Factor: ${result.adjustmentFactor}`);
      }
      console.log('');
    });

    // Example usage for settlement records
    console.log('=== Settlement Data for Database ===');
    const settlementRecords = Object.entries(results.runners)
      .map(([selectionId, runner]) => {
        const selId = parseInt(selectionId);
        const result = results.result[selId];
        
        if (!result) {
          return null;
        }
        
        return {
          market_id: results.marketId,
          selection_id: selId,
          runner_name: runner.name,
          result_status: result.status,
          bsp_price: results.bsp[selId] || null,
          total_matched: runner.totalMatched,
          venue: results.venue,
          event_name: results.eventName,
          market_time: results.marketTime,
          settled_time: results.settledTime,
          adjustment_factor: result.adjustmentFactor || null
        };
      })
      .filter(record => record !== null);

    console.log(JSON.stringify(settlementRecords, null, 2));

  } catch (error) {
    console.error('Error:', error);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  demonstrateComprehensiveMarketResults();
}

export { demonstrateComprehensiveMarketResults };