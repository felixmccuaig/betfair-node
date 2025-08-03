# Historical Data Backtesting

This directory contains examples for backtesting with historical Betfair exchange data. You can use these tools to analyze historical market behavior, test trading strategies, and understand market dynamics without connecting to the live Betfair API.

## Quick Start

1. **Place your historical data file in the examples directory**
   - The data should be line-delimited JSON format from Betfair Exchange Stream
   - Each line should contain a market change message (mcm operation)
   - Example filename: `1.216777904` (your market ID)

2. **Run the simple backtest**
   ```bash
   npm run example:backtest
   ```

3. **Check the results in `backtest_results/` directory**

## Available Examples

### 1. Simple Backtest (`simple-backtest.ts`)
**Recommended for most users**

A user-friendly script that processes historical data and provides comprehensive analysis.

```bash
# Run with default settings
npm run example:backtest

# Or run directly with ts-node
npx ts-node examples/simple-backtest.ts
```

**Features:**
- ✅ Easy to use - no configuration needed
- ✅ Comprehensive market analysis
- ✅ Runner performance statistics  
- ✅ Volume and turnover analysis
- ✅ Price movement tracking
- ✅ Winner identification
- ✅ BSP (Betfair Starting Price) analysis

**Output includes:**
- Processing summary (messages/second, duration)
- Market analysis (completion rates, duration)
- Trading statistics (volume, turnover, market depth)
- Detailed market breakdowns
- Top runners by volume/activity

### 2. Advanced Backtest (`historical-data-backtest.ts`)
**For advanced users and custom analysis**

A more flexible library for custom backtesting implementations.

```bash
# Run verbose analysis
npm run example:backtest-verbose
```

**Features:**
- 🔧 Fully configurable
- 🔧 Programmatic API
- 🔧 Custom callback support
- 🔧 Detailed logging options
- 🔧 Export to multiple formats

## Data File Format

Your historical data file should contain line-delimited JSON messages from the Betfair Exchange Stream API:

```json
{"op":"mcm","clk":"AAAAAAAA","pt":1691290098377,"mc":[{"id":"1.216777904","marketDefinition":{...},"rc":[...]}]}
{"op":"mcm","clk":"AIVCAJdqAJFb","pt":1691290242265,"mc":[{"id":"1.216777904","rc":[...]}]}
...
```

Where:
- `op`: Operation type (usually "mcm" for market change message)
- `clk`: Clock value for message ordering
- `pt`: Publish time (Unix timestamp in milliseconds)
- `mc`: Market changes array containing market data

## Sample Analysis Output

```
🎯 Simple Historical Data Backtest
==================================

📁 Input file: 1.216777904
📂 Output directory: ./backtest_results

🎉 BACKTEST COMPLETED SUCCESSFULLY!
===================================

📊 PROCESSING SUMMARY:
   • File processed: 1.216777904
   • Total messages: 5,263
   • Processing time: 0.45s
   • Messages/second: 11,695

🏁 MARKET ANALYSIS:
   • Markets discovered: 1
   • Markets completed: 1  
   • Average market duration: 180.5 minutes

💰 TRADING STATISTICS:
   • Total volume traded: 45,234
   • Total turnover: 123,456.78 AUD
   • Average market depth: 45,234
   • Unique prices traded: 234

🏆 MARKET DETAILS:
==================

1. Win Market Name
   📍 Event: Sandown Park
   🆔 Market ID: 1.216777904
   📊 Status: CLOSED
   ⏱️  Duration: 180.5 minutes
   🏃 Runners: 8
   💰 Total Matched: 45,234
   🎯 BSP Reconciled: ✅
   🏆 Winners: 58345062

   📈 Top Runners by Volume:
      1. 🏆 Winner Name
          💵 @ 2.48 (BSP: 2.50)
          📊 Volume: 15,234 | Turnover: 37,781.52
          📈 Price Range: 2.12 - 3.35 (45 trades)
      2. 📊 Runner Name 2
          💵 @ 5.40 (BSP: 5.50)
          📊 Volume: 8,901 | Turnover: 48,055.40
          📈 Price Range: 4.20 - 7.80 (32 trades)
```

## Understanding the Statistics

### Market-Level Statistics
- **Total Matched**: Total volume traded across all runners
- **Duration**: Time from first to last message
- **BSP Reconciled**: Whether Betfair Starting Prices were calculated
- **Market Depth**: Total available liquidity

### Runner-Level Statistics  
- **Volume**: Total amount traded on the runner
- **Turnover**: Total monetary value traded (price × volume)
- **Price Range**: Highest and lowest prices traded
- **Volume Weighted Price**: Average price weighted by volume
- **BSP**: Betfair Starting Price (if available)
- **Final Price**: Last traded price

### Trading Activity Analysis
- **Unique Prices**: Number of different price levels traded
- **Price Movements**: How prices changed over time
- **Volume Distribution**: Which runners had the most activity
- **Market Efficiency**: Spread analysis and liquidity patterns

## Common Use Cases

### 1. Strategy Backtesting
Analyze how your trading strategy would have performed:
- Track price movements and identify entry/exit points
- Calculate hypothetical profit/loss
- Understand market timing and liquidity

### 2. Market Research
Study market behavior patterns:
- How do prices move before race start?
- Which types of events have the most liquidity?
- How accurate are pre-race odds vs final results?

### 3. Risk Analysis
Understand market risks:
- Volatility patterns in different market conditions
- Liquidity availability at different price levels
- Market completion rates and settlement patterns

## Customization

### Modifying the Simple Backtest

Edit `examples/simple-backtest.ts` to customize:

```typescript
const config: BacktestConfig = {
  inputFile: path.join(__dirname, 'your-data-file.txt'),
  outputDirectory: path.join(__dirname, '..', 'custom_results'),
  currencyCode: 'GBP', // Change currency
  currencyRate: 1.0,
  enableVerboseLogging: true, // Enable detailed logs
  generateSummaryReport: true,
};
```

### Creating Custom Analysis

Use the advanced backtest as a library:

```typescript
import { backtestHistoricalData, BacktestConfig } from './historical-data-backtest';

const summary = await backtestHistoricalData(config);

// Access detailed data
summary.marketSummaries.forEach(market => {
  market.runnerSummaries.forEach(runner => {
    // Custom analysis logic here
    console.log(`${runner.name}: ${runner.totalVolume} volume`);
  });
});
```

## Troubleshooting

### "File not found" Error
- Ensure your data file is in the `examples/` directory
- Check the filename matches exactly (case sensitive)
- Verify the file is not empty

### "Failed to parse" Errors
- Ensure data is line-delimited JSON format
- Check that each line is valid JSON
- Remove any empty lines or comments

### No Markets Found
- Verify your data contains `mcm` (market change message) operations
- Check that market definitions are present in the data
- Ensure the data contains complete market lifecycles

### Memory Issues with Large Files
- Process files in chunks for very large datasets
- Enable verbose logging to track progress
- Consider using streaming JSON parsers for massive files

## Need Help?

- Check the example data file format in `examples/1.216777904`
- Review the main README.md for general setup instructions
- Look at other example files for patterns and usage
- Enable verbose logging to debug processing issues

Happy backtesting! 🏇📊