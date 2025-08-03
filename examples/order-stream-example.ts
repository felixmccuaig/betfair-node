/**
 * Example demonstrating Betfair Order Stream functionality
 * 
 * This example shows how to:
 * - Connect to the order stream
 * - Subscribe to order changes with different filters
 * - Handle order updates including unmatched orders and matched amounts
 * - Process different order states and transitions
 */

// Load environment variables from .env file
import * as dotenv from 'dotenv';
dotenv.config();

import {
  login,
  createAndConnectStream,  
  subscribeToOrders,
  closeStream,
  OrderAccountCache,
  OrderFilter,
  OrderSide,
  createBetfairApiState,
  listCurrentOrders,
  Side,
  OrderStatus,
} from '../src/index';

// Import stream-specific enums to avoid conflict with JSON-RPC API enums
import { StreamOrderStatus } from '../src/betfair-exchange-stream-api-types';

// Example order change callback that logs detailed order information
const orderChangeCallback = (orderCache: { [key: string]: OrderAccountCache }, deltas: string[]) => {
  console.log('\n=== STREAM ORDER UPDATE (EXECUTABLE ORDERS ONLY) ===');
  console.log('Deltas:', deltas);
  
  let totalStreamOrders = 0;
  Object.entries(orderCache).forEach(([marketId, marketData]) => {
    console.log(`\nMarket ${marketId} (closed: ${marketData.closed}):`);
    
    Object.entries(marketData.runners).forEach(([runnerId, runnerData]) => {
      console.log(`  Runner ${runnerId}${runnerData.hc ? ` (hc: ${runnerData.hc})` : ''}:`);
      
      // Show unmatched orders
      Object.entries(runnerData.unmatchedOrders).forEach(([orderId, order]) => {
        totalStreamOrders++;
        const sideSymbol = order.side === OrderSide.BACK ? '👆' : '👇';
        const statusSymbol = order.status === StreamOrderStatus.EXECUTABLE ? '⏳' : '✅';
        
        console.log(`    ${sideSymbol} ${statusSymbol} Order ${orderId}: ${order.side} ${order.s}@${order.p}`);
        console.log(`      Status: ${order.status}, Matched: ${order.sm}/${order.s}, Remaining: ${order.sr}`);
        if (order.avp) {
          console.log(`      Average Price: ${order.avp}, Strategy: ${order.rfs || 'none'}`);
        }
      });
      
      // Show matched backs ladder
      if (runnerData.matchedBacks.length > 0) {
        console.log('    💰 Matched Backs:', runnerData.matchedBacks.map(([p, s]) => `${s}@${p}`).join(', '));
      }
      
      // Show matched lays ladder  
      if (runnerData.matchedLays.length > 0) {
        console.log('    💸 Matched Lays:', runnerData.matchedLays.map(([p, s]) => `${s}@${p}`).join(', '));
      }
      
      // Show strategy matches if present
      Object.entries(runnerData.strategyMatches).forEach(([strategy, matches]) => {
        if (matches.mb && matches.mb.length > 0) {
          console.log(`    🎯 Strategy ${strategy} Backs:`, matches.mb.map(([p, s]) => `${s}@${p}`).join(', '));
        }
        if (matches.ml && matches.ml.length > 0) {
          console.log(`    🎯 Strategy ${strategy} Lays:`, matches.ml.map(([p, s]) => `${s}@${p}`).join(', '));
        }
      });
    });
  });
  
  console.log(`\n📊 Stream shows ${totalStreamOrders} executable orders (unmatched only)`);
  console.log('ℹ️  Stream does NOT show: fully matched, cancelled, or lapsed orders');
  console.log('=== END STREAM UPDATE ===\n');
};

// Simple market change callback (for completeness)
const marketChangeCallback = () => {
  // Not focusing on market data in this example
};

async function demonstrateOrderStream() {
  console.log('🏇 Betfair Order Stream Example\n');
  
  // You'll need to set these environment variables or replace with actual values
  const appKey = process.env.BETFAIR_APP_KEY;
  const username = process.env.BETFAIR_USERNAME; 
  const password = process.env.BETFAIR_PASSWORD;
  
  if (!appKey || !username || !password) {
    console.error('❌ Please set BETFAIR_APP_KEY, BETFAIR_USERNAME, and BETFAIR_PASSWORD environment variables');
    return;
  }

  try {
    // 1. Login to get session token
    console.log('🔐 Logging in to Betfair...');
    const apiState = createBetfairApiState('en', 'AUD', 0, 5000, marketChangeCallback);
    const loggedInState = await login(apiState, appKey, username, password);
    console.log('✅ Login successful');

    // 2. Connect to streaming API with order callback
    console.log('🔌 Connecting to streaming API...');
    console.log('⚙️ SEGMENTATION ENABLED - testing segmentation fix');
    const streamState = await createAndConnectStream(
      loggedInState.sessionKey!,
      appKey,
      true, // segmentationEnabled - ENABLED TO TEST FIX
      500,  // conflateMs
      5000, // heartbeatMs
      { currencyCode: 'AUD', rate: 1.0 },
      marketChangeCallback,
      orderChangeCallback // Order callback
    );
    console.log('✅ Connected to stream');

    // 2.5. First, let's see ALL your orders via JSON-RPC API for comparison
    console.log('📊 Fetching ALL your orders via JSON-RPC API...');
    try {
      console.log('🔍 Making API call...');
      const allOrdersResponse = await listCurrentOrders(loggedInState);
      console.log('📦 Raw response structure:', {
        status: allOrdersResponse.status,
        statusText: allOrdersResponse.statusText,
        dataKeys: Object.keys(allOrdersResponse.data || {}),
        resultType: typeof allOrdersResponse.data?.result,
        resultValue: allOrdersResponse.data?.result
      });
      
      const resultData = allOrdersResponse.data?.result as any || {};
      const allOrders = resultData.currentOrders || [];
      
      console.log(`📈 Total orders found: ${Array.isArray(allOrders) ? allOrders.length : 'Not an array'}`);
      console.log(`📋 More available: ${resultData.moreAvailable || false}`);
      
      if (Array.isArray(allOrders) && allOrders.length > 0) {
        console.log('📋 All Orders Summary:');
        allOrders.forEach((order, index) => {
          const sideSymbol = order.side === Side.BACK ? '👆' : '👇';
          const statusSymbol = order.status === OrderStatus.EXECUTABLE ? '⏳' : '✅';
          console.log(`  ${index + 1}. ${sideSymbol} ${statusSymbol} ${order.side} ${order.sizeRemaining || order.priceSize.size}@${order.priceSize.price} (Market: ${order.marketId})`);
          console.log(`     Status: ${order.status}, Matched: ${order.sizeMatched || 0}/${order.priceSize.size}, Placed: ${new Date(order.placedDate).toLocaleTimeString()}`);
        });
      } else {
        console.log('ℹ️  No orders found via JSON-RPC API');
      }
      console.log();
    } catch (error) {
      console.error('❌ Error fetching orders:', error);
      if (error && typeof error === 'object' && 'response' in error) {
        const axiosError = error as any;
        console.error('Response data:', axiosError.response?.data);
        console.error('Response status:', axiosError.response?.status);
      }
    }

    // 3. Subscribe to ALL orders with explicit filter to ensure we get everything
    console.log('📋 Now subscribing to order STREAM (only shows EXECUTABLE orders)...');
    const allOrdersFilter: OrderFilter = {
      includeOverallPosition: true, // Make sure we get all position data
      // customerStrategyRefs: undefined, // Include all strategies  
      // partitionMatchedByStrategyRef: false // Don't partition by strategy initially
    };
    
    console.log('🔧 Using explicit filter for ALL orders:', allOrdersFilter);
    let updatedStreamState = subscribeToOrders(streamState, allOrdersFilter);
    console.log('✅ Subscribed to order stream with explicit filter');

    // Wait for some order data
    await new Promise(resolve => setTimeout(resolve, 10000));

    // 4. Subscribe with specific strategy filter
    console.log('🎯 Subscribing to specific strategy orders...');
    const strategyFilter: OrderFilter = {
      includeOverallPosition: false,
      customerStrategyRefs: ['MyTradingStrategy', 'ScalpingBot'],
      partitionMatchedByStrategyRef: true
    };
    
    updatedStreamState = subscribeToOrders(updatedStreamState, strategyFilter);
    console.log('✅ Subscribed to filtered orders');

    // Keep the stream open for continuous monitoring
    console.log('🔄 Stream is now running continuously...');
    console.log('💡 Press Ctrl+C to stop');
    
    // Set up graceful shutdown on Ctrl+C
    process.on('SIGINT', () => {
      console.log('\n👋 Received shutdown signal, closing connection...');
      closeStream(updatedStreamState);
      console.log('✅ Connection closed gracefully');
      process.exit(0);
    });

    // Keep the process alive
    await new Promise(() => {}); // This promise never resolves, keeping the stream open

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Usage examples of order data processing
function processOrderUpdates(orderCache: { [key: string]: OrderAccountCache }) {
  console.log('\n📊 Processing Order Data:');
  
  let totalUnmatchedOrders = 0;
  let totalMatchedVolume = 0;
  
  Object.values(orderCache).forEach(market => {
    Object.values(market.runners).forEach(runner => {
      // Count unmatched orders
      totalUnmatchedOrders += Object.keys(runner.unmatchedOrders).length;
      
      // Calculate total matched volume
      runner.matchedBacks.forEach(([price, size]) => {
        totalMatchedVolume += size;
      });
      runner.matchedLays.forEach(([price, size]) => {
        totalMatchedVolume += size;
      });
      
      // Check for executable orders nearing full match
      Object.values(runner.unmatchedOrders).forEach(order => {
        if (order.status === StreamOrderStatus.EXECUTABLE && order.sr < order.s * 0.1) {
          console.log(`⚠️  Order ${order.id} is ${((order.sm / order.s) * 100).toFixed(1)}% matched`);
        }
        
        // Check for execution complete orders
        if (order.status === StreamOrderStatus.EXECUTION_COMPLETE) {
          console.log(`✅ Order ${order.id} fully matched at average price ${order.avp}`);
        }
      });
    });
  });
  
  console.log(`📈 Summary: ${totalUnmatchedOrders} unmatched orders, ${totalMatchedVolume} total matched volume`);
}

// Run the example
if (require.main === module) {
  demonstrateOrderStream()
    .then(() => console.log('✅ Example completed'))
    .catch(error => console.error('❌ Example failed:', error));
}

export { demonstrateOrderStream, processOrderUpdates, orderChangeCallback };