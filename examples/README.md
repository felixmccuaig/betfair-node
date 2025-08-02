# Betfair API Examples

This directory contains practical examples for using the Betfair Node.js library.

## Setup

1. **Create a `.env` file** in the project root (not in the examples folder) with your Betfair credentials:

```env
# Required: Betfair API Credentials
BETFAIR_APP_KEY=your_application_key_here
BETFAIR_USERNAME=your_username_here
BETFAIR_PASSWORD=your_password_here

# Optional: Configuration
TIMEZONE=Australia/Sydney
LOCALE=en
CURRENCY=AUD
```

2. **Get your Betfair API credentials:**
   - Sign up for a [Betfair Developer Account](https://developer.betfair.com/)
   - Create an Application to get your App Key
   - Use your regular Betfair account username and password

## Examples

All examples require a `.env` file with your Betfair credentials (see Setup section below).

### Available Examples

| Script | Command | Description |
|--------|---------|-------------|
| 🐕 **Greyhound Markets** | `npm run example:greyhounds` | List Australian greyhound markets 5pm-7pm |
| 💰 **Place Bet** | `npm run example:bet` | Place a real back bet with validation |
| 📺 **Live Trading View** | `npm run example:live` | Real-time price ladder display |
| 📊 **General Example** | `npm run example` | Comprehensive API demonstration |

### 🐕 Greyhound Markets Example

**File:** `greyhound-markets.ts`

Lists all Australian greyhound racing markets between 5pm and 7pm today (or tomorrow if it's already past 7pm).

**Features:**
- 🔐 Environment variable configuration
- 🕐 Time-based market filtering
- 🏁 Detailed race information
- 📊 Summary statistics
- 💱 Currency conversion support

**Run the example:**

```bash
# Using the npm script (recommended)
npm run example:greyhounds

# Or directly with ts-node
npx ts-node examples/greyhound-markets.ts
```

**Sample Output:**
```
🐕 Australian Greyhound Markets (5pm-7pm)
==========================================

🔐 Logging in to Betfair...
✅ Successfully authenticated

📅 Searching for markets from 3/12/2024, 5:00:00 pm to 3/12/2024, 7:00:00 pm

🔍 Fetching greyhound markets...
✅ Found 12 greyhound markets

🏁 GREYHOUND MARKETS
====================

1. Wentworth Park - Race 7
   📍 Market: R7 520m Hcp
   🕐 Start: 17:15 (3/12/2024)
   💰 Matched: $12,450
   🆔 Market ID: 1.234567890
   🐕 Runners (8):
      1. Lightning Bolt
      2. Fast Eddie
      3. Quick Silver
      ...

📊 SUMMARY
===========
🏁 Total Markets: 12
🏟️  Unique Venues: 4
💰 Total Matched: $156,780
📍 Venues: Wentworth Park, The Meadows, Sandown Park, Angle Park
```

### 💰 Betting Example

**File:** `place-bet.ts`

Places a real back bet on a specified market with comprehensive error handling and success reporting.

**Features:**
- 🎯 Real bet placement on live markets
- 🔍 Market validation and runner selection
- 💡 Profit/liability calculations
- ⚠️ Safety warnings and confirmations
- 📊 Detailed success/error reporting
- 🔧 Automatic parameter optimization

**Run the example:**

```bash
# Build the project first
npm run build

# Run the betting example
npm run example:bet
```

**Sample Output:**
```
💰 Placing Back Bet Example
============================

🔐 Logging in to Betfair...
✅ Successfully authenticated

📊 Fetching market data for 1.246211762...
✅ Market: 1.246211762
📈 Status: OPEN
🔢 Version: 6771597885
💱 Total Matched: £32.44

🐕 Selected Runner:
   Selection ID: 72097028
   Status: ACTIVE
   Best Back Price: 3.9 (£71.2 available)
   Best Lay Price: 10 (£11.92 available)

🔍 Validating bet parameters...
✅ Bet parameters are valid
💡 Potential profit: £9 (stake: £1, odds: 10)

🎯 Placing bet...
   Market ID: 1.246211762
   Selection ID: 72097028
   Side: BACK
   Stake: £1
   Odds: 10
   Order Type: LIMIT
   Persistence: LAPSE

⚠️  WARNING: This will place a REAL bet with REAL money!

🔧 Placing bet...

✅ Bet placement response received:
   Status: SUCCESS
   Customer Ref: bet-1754124715763

📋 Instruction Report:
   Status: SUCCESS
   Order Status: EXECUTABLE
   Bet ID: 396693670550
   Placed Date: 2025-08-02T08:51:56.000Z
   Size Matched: £0
   Average Price Matched: N/A

⏳ SUCCESS: Bet was placed but not yet matched
   Your bet is now in the market waiting for someone to match it
```

### 📺 Live Trading View Example

**File:** `live-trading-view.ts`

Real-time market data display with live price ladders, similar to professional trading software.

**Features:**
- 📡 Real-time market data streaming
- 📊 Live price ladder display for all runners
- 🏃 Runner status and last traded prices
- 🔄 Auto-refreshing CLI interface
- 💰 Total matched amounts
- ⚡ Fast updates (500ms refresh rate)

**Run the example:**

```bash
# Using the npm script with a specific market ID (recommended)
npm run example:live -- marketid=1.246210458

# Or directly with ts-node
npx ts-node examples/live-trading-view.ts marketid=1.246210458

# Show help and usage
npm run example:live -- --help
```

**Finding Market IDs:**
- Use the `greyhound-markets.ts` example to list available markets and their IDs
- Check the Betfair Exchange website and look at the URL (e.g., `/exchange/plus/football/market/1.123456789`)
- Market IDs always start with "1." followed by numbers (e.g., 1.246210458)

**Sample Output:**
```
📺 LIVE TRADING VIEW
===================
🎯 Market ID: 1.246210458

Market: R5 457m Gr5
Status: 🟢 OPEN
Total Matched: £45,230
Last Update: 6:45:23 PM
Updates: 127

┌───────────────────────────────────────────────────────────────────────────────────┐
│                            LIVE MARKET DATA                                       │
├───────────────────────────────────────────────────────────────────────────────────┤
│ Runner                  │   Best Back    │    Best Lay    │  LTP   │   Vol($)   │
├─────────────────────────┼────────────────┼────────────────┼────────┼────────────┤
│ 🏃Professor Starr        │           2.50 │           2.55 │   2.52 │    $16.0k │
├─────────────────────────┼────────────────┼────────────────┼────────┼────────────┤
│ 🏃Clean Cut             │           4.20 │           4.30 │   4.25 │     $7.0k │
├─────────────────────────┼────────────────┼────────────────┼────────┼────────────┤
│ 🏃Ricochet Ripple       │           6.80 │           7.00 │   6.90 │     $2.3k │
├─────────────────────────┼────────────────┼────────────────┼────────┼────────────┤
│ 🏃Cash Handy            │          12.00 │          13.00 │  12.50 │    $1,690 │
└─────────────────────────┴────────────────┴────────────────┴────────┴────────────┘

📊 LEGEND:
   🟢 Best Back: Highest price you can back at (best odds to take)
   🔴 Best Lay:  Lowest price you can lay at (best odds to offer)
   💰 LTP:      Last Traded Price
   📈 Vol($):   Total amount matched in AUD (k=thousands, M=millions)
   🎨 Colors:   Green = price up, Red = price down

🔄 Live updates every 500ms - Press Ctrl+C to exit
```

**Key Features:**
- **📡 Real-time Streaming**: Uses Betfair Exchange Stream API for live data
- **🎯 Essential Data Only**: Shows just Best Back, Best Lay, LTP, and Volume - no clutter!
- **📊 Status Indicators**: Visual indicators for market and runner status
- **⚡ Fast Updates**: 500ms refresh rate with differential updates (no flicker!)
- **🎨 Color Coding**: Green for price increases, red for decreases
- **🔄 Smooth Updates**: Only changed lines refresh, professional feel
- **💰 Clean Display**: Focused on the essential trading information
- **💻 Professional Layout**: Clean, easy-to-read trading interface
- **⌨️ Responsive**: Hide cursor during updates, clean exit handling
- **🚫 No Debug Noise**: Removed all heartbeat logging for clean output
- **🏁 BSP Support**: Shows Betfair Starting Price when markets close
- **📋 Command Line Args**: Specify any market ID via `marketid=1.123456789`

### Key Features

- **🔍 Smart Filtering:** Automatically filters for greyhound racing (event type 4339) in Australia
- **⏰ Time Intelligence:** Handles timezone conversion and automatically looks at tomorrow if past 7pm
- **🎯 Detailed Information:** Shows venue, race number, start time, matched amounts, and runners
- **💡 Error Handling:** Clear error messages for authentication and API issues
- **📊 Statistics:** Summary of total markets, venues, and matched amounts

### Customization

You can modify the example to:

- **Change time range:** Modify the `startTime.setHours()` and `endTime.setHours()` calls
- **Different countries:** Change `marketCountries: ['AU']` to other country codes
- **Other sports:** Change `eventTypeIds: ['4339']` to other event types:
  - `1` - Soccer
  - `2` - Tennis  
  - `4` - Cricket
  - `7` - Horse Racing
  - `4339` - Greyhound Racing
- **Market types:** Change `marketTypeCodes: ['WIN']` to other market types like `['PLACE']`, `['SHOW']`

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BETFAIR_APP_KEY` | ✅ Yes | - | Your Betfair application key |
| `BETFAIR_USERNAME` | ✅ Yes | - | Your Betfair account username |
| `BETFAIR_PASSWORD` | ✅ Yes | - | Your Betfair account password |
| `TIMEZONE` | ❌ No | `Australia/Sydney` | Timezone for time-based filtering |
| `LOCALE` | ❌ No | `en` | Locale for API responses |
| `CURRENCY` | ❌ No | `AUD` | Currency for amounts |

## Troubleshooting

### Authentication Errors

- **Invalid App Key:** Check your `BETFAIR_APP_KEY` is correct
- **Invalid Credentials:** Verify your `BETFAIR_USERNAME` and `BETFAIR_PASSWORD`
- **Account Restrictions:** Ensure your account has API access enabled

### No Markets Found

- **Time Range:** Markets might not be available in the specified time range
- **Market Availability:** Greyhound markets might not be scheduled for that time
- **Country/Venue:** Try different countries or remove country filter

### API Errors

- **Rate Limiting:** Wait a few seconds and try again
- **Network Issues:** Check your internet connection
- **Service Unavailable:** Betfair API might be down for maintenance

## Next Steps

1. **Explore the API:** Use this example as a starting point to explore other Betfair API endpoints
2. **Build Applications:** Create your own betting applications using the functional API  
3. **Real-time Data:** Combine with the Exchange Stream API for live market updates
4. **Advanced Features:** Implement order placement, management, and strategy automation

For more information, see the main project README and API documentation.