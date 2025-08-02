# betfair-node

A comprehensive Node.js TypeScript library for the Betfair Exchange API, providing both JSON-RPC API integration and real-time Exchange Stream API support for automated betting and trading applications. Features advanced market recording capabilities for capturing raw TLS stream data and structured market summaries.

[![npm version](https://badge.fury.io/js/betfair-node.svg)](https://badge.fury.io/js/betfair-node)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

### 🚀 **Core API Integration**
- **Authentication**: Interactive login with username/password (certificate auth coming soon)
- **Market Data**: List markets, get market books, runner details, and pricing information
- **Order Management**: Place, cancel, replace, and update bets with comprehensive validation
- **Account Operations**: Get account details, balance, statement, and currency rates

### 📡 **Real-time Exchange Stream API**
- **Live Market Data**: Subscribe to real-time market updates with low latency
- **Stream Decoding**: Automatic deserialization and caching of market deltas
- **Connection Management**: Robust connection handling with automatic reconnection
- **Heartbeat Monitoring**: Built-in connection health monitoring

### 🛠️ **Developer Experience**
- **Full TypeScript Support**: Complete type definitions for all API responses
- **Functional API**: Modern functional programming approach with immutable state
- **Error Handling**: Comprehensive error handling and validation
- **Flexible Configuration**: Support for different currencies, locales, and regions

### 📊 **Professional Trading Features**
- **Price Ladder Display**: Real-time price ladder visualization
- **Market Caching**: Efficient delta-based market state management  
- **Request Conflation**: Batch multiple market subscriptions for efficiency
- **Currency Conversion**: Automatic currency rate handling and conversion

### 📹 **Market Recording & Analysis**
- **Raw Data Recording**: Capture pure TLS stream transmissions before any processing
- **Structured Market Summaries**: Automatic BSP, winner, and trading volume extraction
- **Market-Specific Files**: Individual files per market for organized data storage
- **Production-Ready Monitoring**: Robust heartbeat and error handling for long recordings

## Installation

```bash
npm install betfair-node
```

## Quick Start

### 1. Set up your credentials

Create a `.env` file in your project root:

```env
BETFAIR_APP_KEY=your_application_key_here
BETFAIR_USERNAME=your_username_here
BETFAIR_PASSWORD=your_password_here
```

### 2. Basic API Usage

```typescript
import { createBetfairApiState, login, listMarketCatalogue } from 'betfair-node';

async function main() {
  // Create API state
  const apiState = createBetfairApiState('AUD', 'en');
  
  // Login to Betfair
  const authResult = await login(
    apiState,
    process.env.BETFAIR_APP_KEY!,
    process.env.BETFAIR_USERNAME!,
    process.env.BETFAIR_PASSWORD!
  );
  
  if (authResult.success) {
    // List horse racing markets
    const marketFilter = {
      eventTypeIds: ['7'], // Horse Racing
      marketCountries: ['AU'],
      marketTypeCodes: ['WIN']
    };
    
    const markets = await listMarketCatalogue(
      authResult.state,
      marketFilter,
      ['MARKET_START_TIME', 'RUNNER_DESCRIPTION'],
      'FIRST_TO_START',
      10
    );
    
    console.log(`Found ${markets.length} markets`);
  }
}
```

### 3. Real-time Market Data

```typescript
import { 
  createBetfairApiState, 
  login,
  createAndConnectStream,
  subscribeToMarkets 
} from 'betfair-node';

async function streamMarketData() {
  // Setup and authenticate
  const apiState = createBetfairApiState('AUD', 'en');
  const authResult = await login(apiState, appKey, username, password);
  
  if (authResult.success) {
    // Create stream connection
    const streamResult = await createAndConnectStream(
      authResult.state.sessionKey!,
      authResult.state.appKey!,
      500, // conflation ms
      500, // heartbeat ms
      (marketCache, deltas) => {
        // Handle real-time market updates
        console.log('Market update received:', Object.keys(marketCache));
      }
    );
    
    if (streamResult.success) {
      // Subscribe to specific markets
      await subscribeToMarkets(
        streamResult.state,
        ['1.234567890'], // market IDs
        ['EX_BEST_OFFERS'] // price data fields
      );
    }
  }
}
```

### 4. Place a Bet

```typescript
import { 
  createBetfairApiState,
  login,
  placeOrders,
  validateOrderParameters 
} from 'betfair-node';

async function placeBet() {
  const apiState = createBetfairApiState('AUD', 'en');
  const authResult = await login(apiState, appKey, username, password);
  
  if (authResult.success) {
    const placeInstruction = {
      orderType: 'LIMIT' as const,
      selectionId: 123456,
      side: 'BACK' as const,
      limitOrder: {
        size: 10.00,
        price: 2.50,
        persistenceType: 'LAPSE' as const
      }
    };
    
    // Validate before placing
    const validation = validateOrderParameters([placeInstruction]);
    if (validation.isValid) {
      const result = await placeOrders(
        authResult.state,
        '1.234567890', // market ID
        [placeInstruction],
        'my-bet-ref'
      );
      
      console.log('Bet placed:', result);
    }
  }
}
```

### 5. Market Recording

```typescript
import { 
  createBetfairApiState,
  login,
  listMarketCatalogue,
  createAndConnectRecordingStream,
  subscribeToMarkets,
  createMarketRecorderState,
  startRecording,
  createRecordingMarketChangeCallback,
  createRawDataCallback
} from 'betfair-node';

async function recordMarketData() {
  // Setup authentication
  const apiState = createBetfairApiState('en', 'AUD', 250, 5000, () => {});
  const authResult = await login(apiState, appKey, username, password);

  // Configure recording (both raw and structured data)
  const recorderState = createMarketRecorderState({
    outputDirectory: './recordings',
    enableBasicRecording: true,    // Structured summaries
    enableRawRecording: true,      // Pure TLS stream data
    rawFilePrefix: '',             // Files: {marketId}.txt
    basicFilePrefix: 'basic_',     // Files: basic_{marketId}.json
  });

  // Find markets and start recording
  const markets = await listMarketCatalogue(/* ... */);
  const marketIds = markets.data.result.map(m => m.marketId);
  
  startRecording(recorderState, marketIds);

  // Connect with recording-optimized stream (30s heartbeat)
  const streamState = await createAndConnectRecordingStream(
    authResult.sessionKey,
    appKey,
    false,                        // segmentationEnabled
    250,                          // conflateMs
    { currencyCode: 'AUD', rate: 1.0 },
    createRecordingMarketChangeCallback(recorderState), // Basic recording
    createRawDataCallback(recorderState)                // Raw recording
  );

  subscribeToMarkets(streamState, marketIds);
  
  // Records automatically to:
  // - {marketId}.txt (raw TLS transmissions)
  // - basic_{marketId}.json (market summaries with BSP, winners, etc.)
}
```

## API Reference

### Core Functions

#### Authentication
- `createBetfairApiState(currency, locale)` - Create initial API state
- `login(state, appKey, username, password)` - Authenticate with Betfair
- `logout(state)` - End session

#### Market Data
- `listEventTypes(state, filter)` - Get available sports/event types
- `listMarketCatalogue(state, filter, projections, sort, maxResults)` - Search for markets
- `listMarketBook(state, marketIds, priceProjection)` - Get market pricing data
- `listCurrentOrders(state, betIds?, marketIds?)` - Get current orders

#### Order Management
- `placeOrders(state, marketId, instructions, customerRef?)` - Place new bets
- `cancelOrders(state, marketId, instructions, customerRef?)` - Cancel existing bets
- `replaceOrders(state, marketId, instructions, customerRef?)` - Replace existing bets
- `updateOrders(state, marketId, instructions, customerRef?)` - Update existing bets

#### Account Operations
- `getAccountFunds(state, wallet?)` - Get account balance
- `getAccountDetails(state)` - Get account information
- `getAccountStatement(state, options)` - Get account statement

#### Market Recording
- `createMarketRecorderState(config)` - Initialize market recorder with configuration
- `startRecording(state, marketIds)` - Start recording for specified markets
- `stopRecording(state)` - Stop recording and save all data to files
- `createRecordingMarketChangeCallback(state, originalCallback?)` - Create callback for structured recording
- `createRawDataCallback(state)` - Create callback for raw TLS stream recording
- `getRecordingStatus(state, marketId)` - Get current recording status for a market
- `loadBasicRecord(config, marketId)` - Load previously saved market summary
- `listRecordedMarkets(config)` - List all recorded markets in output directory

### Streaming API

#### Connection Management
- `createAndConnectStream(sessionKey, appKey, conflateMs, heartbeatMs, callback, rawCallback?)` - Connect to stream
- `createAndConnectRecordingStream(sessionKey, appKey, segmentationEnabled, conflateMs, audCurrencyRate, marketCallback, rawCallback?)` - Connect with recording optimization (30s heartbeat)
- `disconnectStream(state)` - Disconnect from stream

#### Market Subscriptions
- `subscribeToMarkets(state, marketIds, fields, segmentationEnabled?)` - Subscribe to markets
- `resubscribeToMarkets(state, marketIds, fields?)` - Update subscription
- `unsubscribeFromMarkets(state, marketIds?)` - Unsubscribe from markets

### Utility Functions
- `validateOrderParameters(instructions)` - Validate bet parameters
- `calculateBackProfit(stake, odds)` - Calculate back bet profit
- `calculateLayLiability(stake, odds)` - Calculate lay bet liability
- `findCurrencyRate(rates, currency)` - Find currency conversion rate

## Examples

The `examples/` directory contains comprehensive examples:

### 🐕 Greyhound Markets (`npm run example:greyhounds`)
Lists Australian greyhound racing markets with detailed information including venues, race times, and runner details.

### 💰 Place Bet (`npm run example:bet`)  
Demonstrates placing a real back bet with validation, error handling, and success reporting.

### 📺 Live Trading View (`npm run example:live`)
Professional real-time trading interface showing live price ladders, similar to trading software. Features:
- Real-time price updates (500ms refresh)
- Color-coded price changes
- Best back/lay prices and volumes
- Clean, professional display

### 📹 Market Recorder (`npm run example:recorder`)
Comprehensive market data recording system that captures both raw TLS transmissions and structured market summaries. Features:
- **Dual Recording**: Raw TLS stream data + structured market summaries
- **Production Ready**: 30-second heartbeat, graceful error handling
- **Market-Specific Files**: Individual files per market for organized storage
- **Complete Lifecycle**: Records from market open through settlement

### 📹 Simple Market Recorder (`npm run example:recorder-simple`)
Streamlined 30-second recording example perfect for testing and quick data capture.

> **📖 Detailed Documentation**: See [`examples/MARKET_RECORDER_README.md`](examples/MARKET_RECORDER_README.md) for comprehensive market recorder documentation including architecture, data flow, and advanced usage.

### Usage
```bash
# List greyhound markets
npm run example:greyhounds

# Place a bet (uses real money!)
npm run example:bet

# Live market view (specify market ID)
npm run example:live -- marketid=1.234567890

# Record market data (5 minutes, multiple markets)
npm run example:recorder

# Quick recording test (30 seconds, 2 markets)
npm run example:recorder-simple
```

## Architecture

### Core Components

- **BetfairApi**: Main API client for JSON-RPC endpoints
- **BetfairExchangeStreamApi**: Real-time streaming client  
- **BetfairStreamDecoder**: Handles stream data deserialization and caching
- **MarketRecorder**: Dual-layer recording system for raw TLS data and structured summaries
- **Heartbeat**: Connection monitoring and health checking
- **Utils**: Helper functions for validation and calculations

### Design Principles

- **Functional Programming**: Immutable state management with pure functions
- **Type Safety**: Comprehensive TypeScript definitions for all API responses
- **Error Handling**: Explicit error handling with detailed error messages
- **Performance**: Efficient caching and delta processing for real-time data
- **Flexibility**: Support for different regions, currencies, and market types

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BETFAIR_APP_KEY` | ✅ Yes | - | Your Betfair application key |
| `BETFAIR_USERNAME` | ✅ Yes | - | Your Betfair account username |
| `BETFAIR_PASSWORD` | ✅ Yes | - | Your Betfair account password |
| `TIMEZONE` | ❌ No | `Australia/Sydney` | Timezone for time-based operations |
| `LOCALE` | ❌ No | `en` | Locale for API responses |
| `CURRENCY` | ❌ No | `AUD` | Default currency for amounts |

## Getting Betfair API Access

1. **Create a Betfair Account**: Sign up at [betfair.com](https://www.betfair.com)
2. **Get Developer Access**: Apply for API access at [developer.betfair.com](https://developer.betfair.com)
3. **Create an Application**: Generate your App Key from the developer portal
4. **Fund Your Account**: Add funds to place real bets (required for full API access)

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Build the project
npm run build

# Run examples
npm run example:greyhounds
npm run example:bet
npm run example:live -- marketid=1.234567890
npm run example:recorder
npm run example:recorder-simple

# Development mode
npm run dev
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## Roadmap

- 🔐 Certificate-based authentication support
- 📊 Advanced market analysis utilities  
- 🎯 Strategy backtesting framework using recorded market data
- 📈 Historical data integration and replay functionality
- 🔄 Enhanced request conflation
- 📱 React/Vue.js integration examples
- 🗂️ Market recording database integration (PostgreSQL/MongoDB)
- 📊 Real-time recording dashboard and monitoring

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This software is for educational and development purposes. Users are responsible for complying with Betfair's terms of service and applicable gambling regulations. The authors are not responsible for any financial losses incurred through the use of this software.

---

**Author**: Felix McCuaig  
**Email**: felixmccuaig@gmail.com  
**GitHub**: [betfair-node](https://github.com/felixmccuaig/betfair-node)

For questions, issues, or feature requests, please use the GitHub issues page.