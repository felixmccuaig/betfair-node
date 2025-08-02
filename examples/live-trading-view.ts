/**
 * Example: Live Trading View
 * 
 * Professional real-time market data display with price ladders for each runner
 * 
 * Features:
 * - 📺 Differential updates (no screen flicker!)
 * - 🎨 Color-coded price changes (green up, red down)
 * - ⚡ Fast 500ms updates with smooth rendering
 * - 📊 Professional trading interface layout
 * - 🔄 Only changed data refreshes (efficient)
 * - ⌨️ Clean cursor handling and exit
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
  listMarketCatalogue,
  findCurrencyRate,
} from "../src/betfair-api";

import {
  createAndConnectStream,
  subscribeToMarkets,
} from "../src/betfair-exchange-stream-api";

import {
  MarketFilter,
  MarketProjection,
  MarketSort,
  RunnerCatalogue,
} from "../src/betfair-api-types";

import { MarketCache, RunnerCache } from "../src/betfair-exchange-stream-api-types";

// Load environment variables
dotenv.config();

// ANSI Color codes for price changes
const COLORS = {
  RESET: '\x1b[0m',
  GREEN: '\x1b[32m',   // Price up
  RED: '\x1b[31m',     // Price down
  YELLOW: '\x1b[33m',  // Highlight
  CYAN: '\x1b[36m',    // Info
  BOLD: '\x1b[1m',
  DIM: '\x1b[2m',
};

interface RunnerDisplay {
  id: number;
  name: string;
  handicap: number;
  status: string;
  lastPriceTraded?: number;
  totalMatched: number;
  backPrices: Array<{ price: number; size: number }>;
  layPrices: Array<{ price: number; size: number }>;
  // For change tracking
  prevBackPrices?: Array<{ price: number; size: number }>;
  prevLayPrices?: Array<{ price: number; size: number }>;
  prevLastPriceTraded?: number;
}

interface MarketDisplay {
  id: string;
  name: string;
  status: string;
  totalMatched: number;
  runners: RunnerDisplay[];
  lastUpdate: Date;
}

interface DisplayState {
  headerLines: string[];
  runnerLines: string[];
  footerLines: string[];
  isInitialized: boolean;
}

let marketDisplayData: MarketDisplay | null = null;
let updateCount = 0;
let currencyExchangeRate = 1.0; // Exchange rate for volume conversion (GBP to target currency)
let previousDisplayState: DisplayState = {
  headerLines: [],
  runnerLines: [],
  footerLines: [],
  isInitialized: false,
};

/**
 * Parse command line arguments
 */
function parseCommandLineArgs(): { marketId: string } {
  const args = process.argv.slice(2); // Remove node and script path
  
  let marketId = '1.246210458'; // Default market ID
  
  for (const arg of args) {
    if (arg.startsWith('marketid=')) {
      const value = arg.split('=')[1];
      if (value) marketId = value;
    } else if (arg.startsWith('--marketid=')) {
      const value = arg.split('=')[1];
      if (value) marketId = value;
    } else if (arg === '--help' || arg === '-h') {
      console.log('📺 Live Trading View');
      console.log('===================\n');
      console.log('Usage: npm run example:live -- marketid=1.123456789');
      console.log('   or: npx ts-node examples/live-trading-view.ts marketid=1.123456789');
      console.log('\nOptions:');
      console.log('  marketid=<id>  Betfair market ID to display (required)');
      console.log('  --help, -h     Show this help message');
      console.log('\nExample:');
      console.log('  npm run example:live -- marketid=1.246210458');
      process.exit(0);
    }
  }
  
  if (!marketId) {
    console.error('❌ Market ID is required');
    console.error('\nUsage: npm run example:live -- marketid=1.123456789');
    process.exit(1);
  }
  
  // Basic validation of market ID format (should start with "1.")
  if (!marketId.match(/^1\.\d+$/)) {
    console.error(`❌ Invalid market ID format: ${marketId}`);
    console.error('   Market ID should be in format: 1.123456789');
    process.exit(1);
  }
  
  return { marketId };
}

async function startLiveTradingView(): Promise<void> {
  // Parse command line arguments
  const { marketId } = parseCommandLineArgs();
  
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

  try {
    console.log('📺 Live Trading View');
    console.log('===================');
    console.log(`🎯 Market ID: ${marketId}\n`);

    // Create initial API state
    let apiState = createBetfairApiState(
      'en',
      'AUD',  // Target currency for volume display only
      50,    // conflateMs - fast updates
      5000,   // heartbeatMs
      onMarketChange // marketChangeCallback
    );

    // Login to Betfair
    console.log('🔐 Logging in to Betfair...');
    apiState = await login(apiState, appKey, username, password);
    console.log('✅ Successfully authenticated\n');

    // Set currency exchange rate for volume display
    if (apiState.currencyRates && apiState.targetCurrency !== 'GBP') {
      const rate = findCurrencyRate(apiState.currencyRates, apiState.targetCurrency);
      if (rate) {
        currencyExchangeRate = rate.rate;
        console.log(`💱 Currency rate: 1 GBP = ${currencyExchangeRate} ${apiState.targetCurrency}`);
      }
    }

    // Get market information first
    console.log(`📊 Fetching market information for ${marketId}...`);
    const marketFilter: MarketFilter = {
      marketIds: [marketId],
    };

    const catalogueResponse = await listMarketCatalogue(
      apiState,
      marketFilter,
      [
        MarketProjection.EVENT,
        MarketProjection.MARKET_START_TIME,
        MarketProjection.RUNNER_DESCRIPTION,
      ],
      MarketSort.FIRST_TO_START,
      1
    );

    const markets = catalogueResponse.data.result;
    if (markets.length === 0) {
      console.error('❌ Market not found');
      process.exit(1);
    }

    const market = markets[0];
    console.log(`✅ Market: ${market.marketName || 'Unknown'}`);
    console.log(`🏟️  Event: ${market.event?.name || 'Unknown'}`);
    console.log(`⏰ Start: ${market.marketStartTime ? new Date(market.marketStartTime).toLocaleString() : 'Unknown'}`);
    console.log(`🏃 Runners: ${market.runners?.length || 0}\n`);

    // Initialize market display data
    marketDisplayData = {
      id: marketId,
      name: market.marketName || 'Unknown Market',
      status: 'UNKNOWN',
      totalMatched: 0,
      runners: market.runners?.map((runner: RunnerCatalogue) => ({
        id: runner.selectionId || 0,
        name: runner.runnerName || 'Unknown Runner',
        handicap: runner.handicap || 0,
        status: 'UNKNOWN',
        totalMatched: 0,
        backPrices: [],
        layPrices: [],
      })) || [],
      lastUpdate: new Date(),
    };

    // Connect to stream
    console.log('🔌 Connecting to Betfair Exchange Stream...');
    const streamState = await createAndConnectStream(
      apiState.sessionKey!,
      apiState.appKey!,
      false, // segmentationEnabled
      apiState.conflateMs,
      apiState.heartbeatMs,
      apiState.currencyRates?.find(r => r.currencyCode === 'AUD') || { currencyCode: 'AUD', rate: 1 },
      onMarketChange
    );
    console.log('✅ Connected to stream\n');

    // Subscribe to market
    console.log(`📡 Subscribing to market ${marketId}...`);
    await subscribeToMarkets(streamState, [marketId]);
    console.log('✅ Subscribed to market updates\n');

    console.log('🎯 Starting live market data display...');
    console.log('Press Ctrl+C to exit\n');

    // Start display loop
    startDisplayLoop();

    // Keep the process running
    process.stdin.resume();

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

function onMarketChange(marketCache: { [key: string]: MarketCache }): void {
  updateCount++;
  
  const market = marketCache[marketDisplayData?.id || ''];
  if (!market || !marketDisplayData) return;

  // Update market data
  marketDisplayData.status = market.marketDefinition?.status || 'UNKNOWN';
  marketDisplayData.totalMatched = market.totalMatched || 0;
  marketDisplayData.lastUpdate = new Date();

  // Update runner data
  marketDisplayData.runners.forEach(runnerDisplay => {
    const runnerKey = runnerDisplay.id.toString();
    const runnerData = market.runners && (market.runners as { [key: string]: RunnerCache })[runnerKey];
    if (runnerData) {
      // Store previous values for change detection
      runnerDisplay.prevBackPrices = [...runnerDisplay.backPrices];
      runnerDisplay.prevLayPrices = [...runnerDisplay.layPrices];
      runnerDisplay.prevLastPriceTraded = runnerDisplay.lastPriceTraded;
      
      runnerDisplay.status = runnerData.status || 'UNKNOWN';
      runnerDisplay.lastPriceTraded = runnerData.ltp; // Use ltp field for last traded price
      runnerDisplay.totalMatched = runnerData.tv || 0; // Use tv field for traded volume
      
      // Update back prices (best 3)
      // batb format: [level, price, size] - we want price (index 1) and size (index 2)
      runnerDisplay.backPrices = [];
      if (runnerData.batb) {
        for (let i = 0; i < Math.min(3, runnerData.batb.length); i++) {
          const level = runnerData.batb[i];
          if (level && level.length >= 3) {
            runnerDisplay.backPrices.push({
              price: level[1] || 0, // price is at index 1
              size: level[2] || 0,  // size is at index 2
            });
          }
        }
      }

      // Update lay prices (best 3)
      // batl format: [level, price, size] - we want price (index 1) and size (index 2)
      runnerDisplay.layPrices = [];
      if (runnerData.batl) {
        for (let i = 0; i < Math.min(3, runnerData.batl.length); i++) {
          const level = runnerData.batl[i];
          if (level && level.length >= 3) {
            runnerDisplay.layPrices.push({
              price: level[1] || 0, // price is at index 1
              size: level[2] || 0,  // size is at index 2
            });
          }
        }
      }
    }
  });
}

function startDisplayLoop(): void {
  const displayInterval = setInterval(() => {
    if (marketDisplayData) {
      displayMarket(marketDisplayData);
    }
  }, 500); // Update every 500ms

  // Clean up on exit
  process.on('SIGINT', () => {
    clearInterval(displayInterval);
    // Show cursor and move to bottom
    process.stdout.write('\x1b[?25h');
    console.log('\n\n👋 Disconnecting from stream...');
    process.exit(0);
  });
}

function displayMarket(market: MarketDisplay): void {
  const currentDisplayState = generateDisplayState(market);
  
  if (!previousDisplayState.isInitialized) {
    // First time - clear screen and draw everything
    process.stdout.write('\x1b[2J\x1b[H'); // Clear screen, move to top
    process.stdout.write('\x1b[?25l'); // Hide cursor
    
    // Draw all lines
    const allLines = [
      ...currentDisplayState.headerLines,
      ...currentDisplayState.runnerLines,
      ...currentDisplayState.footerLines
    ];
    
    allLines.forEach(line => {
      console.log(line);
    });
    
    previousDisplayState = { ...currentDisplayState, isInitialized: true };
    return;
  }

  // Hide cursor for smooth updates
  process.stdout.write('\x1b[?25l');

  // Update header lines (always update these for time/status changes)
  currentDisplayState.headerLines.forEach((line, index) => {
    if (line !== previousDisplayState.headerLines[index]) {
      updateLine(index + 1, line);
    }
  });

  // Update runner lines (only if changed)
  const runnerStartLine = currentDisplayState.headerLines.length + 1;
  currentDisplayState.runnerLines.forEach((line, index) => {
    if (line !== previousDisplayState.runnerLines[index]) {
      updateLine(runnerStartLine + index, line);
    }
  });

  // Update footer lines (only if changed)
  const footerStartLine = runnerStartLine + currentDisplayState.runnerLines.length;
  currentDisplayState.footerLines.forEach((line, index) => {
    if (line !== previousDisplayState.footerLines[index]) {
      updateLine(footerStartLine + index, line);
    }
  });

  // Show cursor again
  process.stdout.write('\x1b[?25h');
  
  // Update previous state
  previousDisplayState = currentDisplayState;
}

function generateDisplayState(market: MarketDisplay): DisplayState {
  const headerLines = [
    '📺 LIVE TRADING VIEW',
    '===================',
    `Market: ${market.name}`,
    `Status: ${getStatusIcon(market.status)} ${market.status}`,
    `Total Matched: £${market.totalMatched.toLocaleString()}`,
    `Last Update: ${market.lastUpdate.toLocaleTimeString()}`,
    `Updates: ${updateCount}`,
    '',
    '┌───────────────────────────────────────────────────────────────────────────────────┐',
    '│                            LIVE MARKET DATA                                       │',
    '├───────────────────────────────────────────────────────────────────────────────────┤',
    '│ Runner                  │     Back       │      Lay       │  LTP   │   Vol($)   │',
    '├─────────────────────────┼────────────────┼────────────────┼────────┼────────────┤',
  ];

  const runnerLines: string[] = [];
  
  market.runners.forEach((runner, index) => {
    const runnerName = truncateString(runner.name, 23);
    const statusIcon = getRunnerStatusIcon(runner.status);
    
    // Check if market is closed/settled to show BSP
    const isMarketClosed = market.status === 'CLOSED' || market.status === 'SETTLED';
    
    let backDisplay: string;
    let layDisplay: string;
    
    if (isMarketClosed) {
      // Show BSP (Betfair Starting Price) when market is closed
      const runnerKey = runner.id.toString();
      const runnerData = market.runners[runnerKey as unknown as number] as unknown as RunnerCache;
      const bspBack = runnerData?.spb?.[0]; // First BSP back price
      const bspLay = runnerData?.spl?.[0]; // First BSP lay price
      
      backDisplay = bspBack ? `BSP ${bspBack[0].toFixed(2)}` : '-';
      layDisplay = bspLay ? `BSP ${bspLay[0].toFixed(2)}` : '-';
    } else {
      // Show regular back/lay prices for open markets
      const bestBack = runner.backPrices.filter(p => p.price > 0)[0];
      backDisplay = bestBack ? 
        formatPriceWithColor(`${bestBack.price.toFixed(2)}`, bestBack.price, runner.prevBackPrices?.[0]?.price) : '-';

      const bestLay = runner.layPrices.filter(p => p.price > 0)[0];
      layDisplay = bestLay ?
        formatPriceWithColor(`${bestLay.price.toFixed(2)}`, bestLay.price, runner.prevLayPrices?.[0]?.price) : '-';
    }

    // Last traded price with color
    const ltp = runner.lastPriceTraded ? 
      formatPriceWithColor(runner.lastPriceTraded.toFixed(2), runner.lastPriceTraded, runner.prevLastPriceTraded) : '-';

    // Volume (total matched) - format more compactly
    const volume = runner.totalMatched > 0 ? formatVolume(runner.totalMatched) : '-';

    runnerLines.push(`│ ${statusIcon}${runnerName.padEnd(22)} │ ${padStringWithColors(backDisplay, 14, 'right')} │ ${padStringWithColors(layDisplay, 14, 'right')} │ ${padStringWithColors(ltp, 6, 'right')} │ ${padStringWithColors(volume, 10, 'right')} │`);
    
    if (index < market.runners.length - 1) {
      runnerLines.push('├─────────────────────────┼────────────────┼────────────────┼────────┼────────────┤');
    }
  });

  runnerLines.push('└─────────────────────────┴────────────────┴────────────────┴────────┴────────────┘');

  const footerLines = [
    '',
    '📊 LEGEND:',
    '   🟢 Best Back: Highest price you can back at (best odds to take)',
    '   🔴 Best Lay:  Lowest price you can lay at (best odds to offer)', 
    '   💰 LTP:      Last Traded Price',
    '   📈 Vol($):   Total amount matched in AUD (k=thousands, M=millions)',
    '   🎨 Colors:   Green = price up, Red = price down',
    '   🏁 BSP:      Betfair Starting Price (shown when market closes)',
    '',
    '🔄 Live updates every 500ms - Press Ctrl+C to exit'
  ];

  return {
    headerLines,
    runnerLines,
    footerLines,
    isInitialized: true,
  };
}

function updateLine(lineNumber: number, content: string): void {
  // Move cursor to specific line, clear line, write new content
  process.stdout.write(`\x1b[${lineNumber};1H\x1b[K${content}`);
}

function getStatusIcon(status: string): string {
  switch (status) {
    case 'OPEN': return '🟢';
    case 'SUSPENDED': return '⏸️ ';
    case 'CLOSED': return '🔴';
    default: return '⚪';
  }
}

function getRunnerStatusIcon(status: string): string {
  switch (status) {
    case 'ACTIVE': return '🏃';
    case 'WINNER': return '🏆';
    case 'LOSER': return '❌';
    case 'REMOVED': return '🚫';
    default: return '⚪';
  }
}

function truncateString(str: string, maxLength: number): string {
  // Account for ANSI color codes when calculating length
  const cleanStr = str.replace(/\x1b\[[0-9;]*m/g, '');
  if (cleanStr.length <= maxLength) {
    return str;
  }
  // Find the position in the original string that corresponds to maxLength-3 visible characters
  let visibleCount = 0;
  let position = 0;
  for (let i = 0; i < str.length && visibleCount < maxLength - 3; i++) {
    if (str[i] === '\x1b') {
      // Skip ANSI escape sequence
      while (i < str.length && str[i] !== 'm') i++;
    } else {
      visibleCount++;
    }
    position = i + 1;
  }
  return str.substring(0, position) + '...' + COLORS.RESET;
}

function formatPriceWithColor(priceStr: string, currentPrice?: number, previousPrice?: number): string {
  if (!currentPrice || !previousPrice) {
    return priceStr;
  }
  
  if (currentPrice > previousPrice) {
    return `${COLORS.GREEN}${priceStr}${COLORS.RESET}`;
  } else if (currentPrice < previousPrice) {
    return `${COLORS.RED}${priceStr}${COLORS.RESET}`;
  }
  
  return priceStr;
}

function padStringWithColors(str: string, targetLength: number, align: 'left' | 'right'): string {
  // Calculate visible length (excluding ANSI codes)
  const visibleLength = str.replace(/\x1b\[[0-9;]*m/g, '').length;
  const paddingNeeded = Math.max(0, targetLength - visibleLength);
  
  if (paddingNeeded === 0) {
    return str;
  }
  
  const padding = ' '.repeat(paddingNeeded);
  
  if (align === 'right') {
    return padding + str;
  } else {
    return str + padding;
  }
}

function formatVolume(volume: number): string {
  if (volume === 0) return '-';
  
  // Convert volume from GBP to target currency (only for display)
  const convertedVolume = volume * currencyExchangeRate;
  const currencySymbol = currencyExchangeRate !== 1.0 ? '$' : '£'; // Use $ for AUD, £ for GBP
  
  if (convertedVolume >= 1000000) {
    return `${currencySymbol}${(convertedVolume / 1000000).toFixed(1)}M`;
  } else if (convertedVolume >= 1000) {
    return `${currencySymbol}${(convertedVolume / 1000).toFixed(1)}k`;
  } else if (convertedVolume >= 100) {
    return `${currencySymbol}${convertedVolume.toFixed(0)}`;
  } else {
    return `${currencySymbol}${convertedVolume.toFixed(2)}`;
  }
}

// Main execution
if (require.main === module) {
  startLiveTradingView()
    .catch((error) => {
      console.error('\n❌ Failed:', error);
      process.exit(1);
    });
}

export { startLiveTradingView };