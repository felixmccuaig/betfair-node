/**
 * Example: Place a Back Bet
 * 
 * Create a .env file in the project root with:
 * BETFAIR_APP_KEY=your_application_key_here
 * BETFAIR_USERNAME=your_username_here
 * BETFAIR_PASSWORD=your_password_here
 */

import * as dotenv from 'dotenv';
import {
  createBetfairApiState,
  login,
  listMarketBook,
  placeOrders,
  validateOrderParameters,
  calculateBackProfit,
} from "../src/betfair-api";

import {
  PlaceInstruction,
  OrderType,
  PersistenceType,
  Side,
  PriceData,
} from "../src/betfair-api-types";

// Load environment variables
dotenv.config();

async function placeBet(): Promise<void> {
  // Validate environment variables
  const appKey = process.env.BETFAIR_APP_KEY;
  const username = process.env.BETFAIR_USERNAME;
  const password = process.env.BETFAIR_PASSWORD;

  if (!appKey || !username || !password) {
    console.error('❌ Missing required environment variables:');
    console.error('   BETFAIR_APP_KEY, BETFAIR_USERNAME, BETFAIR_PASSWORD');
    console.error('\n📝 Create a .env file with your Betfair credentials');
    process.exit(1);
  }

  const marketId = '1.246211762';
  const targetOdds = 10;
  const stakeAmount = 1;

  try {
    console.log('💰 Placing Back Bet Example');
    console.log('============================\n');

    // Create initial API state
    let apiState = createBetfairApiState(
      'en',
      'AUD',
      500,    // conflateMs
      5000,   // heartbeatMs
      () => {} // marketChangeCallback (not used in this example)
    );

    // Login to Betfair
    console.log('🔐 Logging in to Betfair...');
    apiState = await login(apiState, appKey, username, password);
    console.log('✅ Successfully authenticated\n');

    // Get market book to see available runners and prices
    console.log(`📊 Fetching market data for ${marketId}...`);
    const marketBookResponse = await listMarketBook(
      apiState,
      {
        marketIds: [marketId],
        priceProjection: {
          priceData: [PriceData.EX_BEST_OFFERS],
        },
        virtualise: false,
      }
    );

    const marketBooks = marketBookResponse.data.result;
    if (!marketBooks || marketBooks.length === 0) {
      console.error('❌ Market not found or no data available');
      return;
    }

    const marketBook = marketBooks[0];
    console.log(`✅ Market: ${marketBook.marketId}`);
    console.log(`📈 Status: ${marketBook.status}`);
    console.log(`🔢 Version: ${marketBook.version || 'N/A'}`);
    console.log(`💱 Total Matched: £${marketBook.totalMatched?.toLocaleString() || 0}`);

    if (!marketBook.runners || marketBook.runners.length === 0) {
      console.error('❌ No runners found in this market');
      return;
    }

    // Find the first available runner (typically the first one)
    const runner = marketBook.runners[0];
    const selectionId = runner.selectionId;

    console.log(`\n🐕 Selected Runner:`);
    console.log(`   Selection ID: ${selectionId}`);
    console.log(`   Status: ${runner.status}`);
    
    // Show current best prices if available
    if (runner.ex?.availableToBack && runner.ex.availableToBack.length > 0) {
      const bestBack = runner.ex.availableToBack[0];
      console.log(`   Best Back Price: ${bestBack.price} (£${bestBack.size} available)`);
    }
    
    if (runner.ex?.availableToLay && runner.ex.availableToLay.length > 0) {
      const bestLay = runner.ex.availableToLay[0];
      console.log(`   Best Lay Price: ${bestLay.price} (£${bestLay.size} available)`);
    }

    // Validate order parameters
    console.log(`\n🔍 Validating bet parameters...`);
    const validation = validateOrderParameters(marketId, selectionId, targetOdds, stakeAmount);
    
    if (!validation.isValid) {
      console.error('❌ Invalid bet parameters:');
      validation.errors.forEach(error => console.error(`   - ${error}`));
      return;
    }
    console.log('✅ Bet parameters are valid');

    // Calculate potential profit
    const potentialProfit = calculateBackProfit(stakeAmount, targetOdds);
    console.log(`💡 Potential profit: £${potentialProfit} (stake: £${stakeAmount}, odds: ${targetOdds})`);

    // Create place instruction
    const placeInstructions: PlaceInstruction[] = [
      {
        orderType: OrderType.LIMIT,
        selectionId: selectionId,
        side: Side.BACK,
        limitOrder: {
          size: stakeAmount,
          price: targetOdds,
          persistenceType: PersistenceType.LAPSE,
        },
      },
    ];

    console.log(`\n🎯 Placing bet...`);
    console.log(`   Market ID: ${marketId}`);
    console.log(`   Selection ID: ${selectionId}`);
    console.log(`   Side: BACK`);
    console.log(`   Stake: £${stakeAmount}`);
    console.log(`   Odds: ${targetOdds}`);
    console.log(`   Order Type: LIMIT`);
    console.log(`   Persistence: LAPSE`);

    // Ask for confirmation
    console.log(`\n⚠️  WARNING: This will place a REAL bet with REAL money!`);
    console.log(`   You are about to risk £${stakeAmount} to potentially win £${potentialProfit}`);
    console.log(`   The odds of ${targetOdds} are extremely high and unlikely to be matched.`);
    console.log(`\n🛡️  This is likely a demonstration bet that won't get matched.`);

    // Place the bet
    try {
      console.log('\n🔧 Placing bet...');
      
      const placeResponse = await placeOrders(
        apiState,
        marketId,
        placeInstructions,
        `bet-${Date.now()}`, // Shorter customerRef
        0, // Try without specific market version
        '', // Empty customerStrategyRef
        false // async
      );

      console.log(`\n✅ Bet placement response received:`);
      
      // Check for API errors first
      if (placeResponse.data.error) {
        console.log(`\n❌ API Error:`);
        console.log(`   Code: ${placeResponse.data.error.code}`);
        console.log(`   Message: ${placeResponse.data.error.message}`);
        
        // Interpret common error codes
        switch (placeResponse.data.error.message) {
          case 'DSC-0018':
            console.log(`   💡 This means: Invalid input parameters`);
            console.log(`   🔧 Check the bet parameters are correctly formatted`);
            break;
          case 'DSC-0019':
            console.log(`   💡 This means: Invalid session token`);
            break;
          case 'DSC-0021':
            console.log(`   💡 This means: Invalid app key`);
            break;
          default:
            console.log(`   💡 See Betfair API documentation for error code details`);
        }
        return;
      }
      
      const result = placeResponse.data.result;
      if (!result) {
        console.log('❌ No result in response');
        return;
      }
      
      console.log(`   Status: ${result.status}`);
      console.log(`   Customer Ref: ${result.customerRef || 'N/A'}`);
      
      if (result.errorCode) {
        console.log(`   Error Code: ${result.errorCode}`);
      }

      if (result.instructionReports && result.instructionReports.length > 0) {
        const report = result.instructionReports[0];
        console.log(`\n📋 Instruction Report:`);
        console.log(`   Status: ${report.status}`);
        console.log(`   Order Status: ${report.orderStatus || 'N/A'}`);
        console.log(`   Bet ID: ${report.betId || 'N/A'}`);
        console.log(`   Placed Date: ${report.placedDate || 'N/A'}`);
        console.log(`   Size Matched: £${report.sizeMatched || 0}`);
        console.log(`   Average Price Matched: ${report.averagePriceMatched || 'N/A'}`);
        
        if (report.errorCode) {
          console.log(`   Error Code: ${report.errorCode}`);
        }

        // Interpret the result
        if (report.status === 'SUCCESS') {
          if (report.sizeMatched && report.sizeMatched > 0) {
            console.log(`\n🎉 SUCCESS: Bet was matched!`);
            console.log(`   £${report.sizeMatched} was matched at odds ${report.averagePriceMatched}`);
          } else {
            console.log(`\n⏳ SUCCESS: Bet was placed but not yet matched`);
            console.log(`   Your bet is now in the market waiting for someone to match it`);
            console.log(`   Given the high odds (${targetOdds}), it's unlikely to be matched`);
          }
        } else {
          console.log(`\n❌ FAILED: Bet placement failed`);
          if (report.errorCode) {
            console.log(`   Reason: ${report.errorCode}`);
            
            // Provide helpful error explanations
            switch (report.errorCode) {
              case 'INSUFFICIENT_FUNDS':
                console.log(`   💡 You don't have enough funds in your account`);
                break;
              case 'INVALID_ODDS':
                console.log(`   💡 The odds ${targetOdds} are not valid for this market`);
                break;
              case 'MARKET_NOT_OPEN_FOR_BETTING':
                console.log(`   💡 This market is not currently accepting bets`);
                break;
              case 'INVALID_BET_SIZE':
                console.log(`   💡 The bet size £${stakeAmount} is not valid`);
                break;
              default:
                console.log(`   💡 Check the Betfair API documentation for error code details`);
            }
          }
        }
      }

    } catch (error: any) {
      console.error('\n❌ Error placing bet:', error.message);
      
      if (error.response?.data) {
        console.error('API Response:', JSON.stringify(error.response.data, null, 2));
      }
    }

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Main execution
if (require.main === module) {
  placeBet()
    .then(() => {
      console.log('\n✅ Bet placement example completed!');
      console.log('\n💡 Next steps:');
      console.log('   - Check your Betfair account to see the bet status');
      console.log('   - Use listCurrentOrders() to see unmatched bets');
      console.log('   - Use cancelOrders() to cancel unmatched bets if needed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Failed:', error);
      process.exit(1);
    });
}

export { placeBet };