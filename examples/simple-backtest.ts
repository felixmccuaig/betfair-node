#!/usr/bin/env ts-node

/**
 * Simple Historical Data Backtest Example
 * 
 * This script provides an easy way to analyze historical Betfair data files
 * and generate summary statistics for backtesting purposes.
 * 
 * Usage:
 *   npm run ts-node examples/simple-backtest.ts
 *   # or
 *   npx ts-node examples/simple-backtest.ts
 * 
 * The script will process the historical data file and output:
 * - Market summary statistics
 * - Runner performance data
 * - Volume and turnover analysis
 * - Price movement statistics
 */

import { backtestHistoricalData, BacktestConfig } from './historical-data-backtest';
import * as path from 'path';

async function main() {
  console.log('🎯 Simple Historical Data Backtest');
  console.log('==================================\n');

  // Configuration for the backtest
  const config: BacktestConfig = {
    inputFile: path.join(__dirname, '1.216777904'), // Your historical data file
    outputDirectory: path.join(__dirname, '..', 'backtest_results'),
    currencyCode: 'AUD',
    currencyRate: 1.0,
    enableVerboseLogging: false, // Change to true for detailed logs
    generateSummaryReport: true,
  };

  // Check if the historical data file exists
  const fs = require('fs');
  if (!fs.existsSync(config.inputFile)) {
    console.error(`❌ Historical data file not found: ${config.inputFile}`);
    console.log('\n💡 Make sure you have a historical data file in the examples directory.');
    console.log('   The file should contain line-delimited JSON with Betfair stream data.');
    process.exit(1);
  }

  console.log(`📁 Input file: ${path.basename(config.inputFile)}`);
  console.log(`📂 Output directory: ${config.outputDirectory}`);
  console.log(`💱 Currency: ${config.currencyCode}\n`);

  try {
    const startTime = Date.now();
    const summary = await backtestHistoricalData(config);
    const totalTime = Date.now() - startTime;

    // Display comprehensive results
    console.log('\n🎉 BACKTEST COMPLETED SUCCESSFULLY!');
    console.log('===================================');
    
    console.log(`\n📊 PROCESSING SUMMARY:`);
    console.log(`   • File processed: ${summary.fileName}`);
    console.log(`   • Total messages: ${summary.totalMessages.toLocaleString()}`);
    console.log(`   • Processing time: ${(totalTime / 1000).toFixed(2)}s`);
    console.log(`   • Messages/second: ${Math.round(summary.totalMessages / (totalTime / 1000)).toLocaleString()}`);

    console.log(`\n🏁 MARKET ANALYSIS:`);
    console.log(`   • Markets discovered: ${summary.marketsProcessed}`);
    console.log(`   • Markets completed: ${summary.completedMarkets}`);
    console.log(`   • Average market duration: ${summary.marketSummaries.length > 0 ? 
      (summary.marketSummaries.reduce((sum, m) => sum + m.durationMinutes, 0) / summary.marketSummaries.length).toFixed(1) : 0} minutes`);

    console.log(`\n💰 TRADING STATISTICS:`);
    console.log(`   • Total volume traded: ${summary.overallStats.totalVolumeTraded.toLocaleString()}`);
    console.log(`   • Total turnover: ${summary.overallStats.totalTurnover.toFixed(2)} ${config.currencyCode}`);
    console.log(`   • Average market depth: ${summary.overallStats.averageMarketDepth.toFixed(0)}`);
    console.log(`   • Unique prices traded: ${summary.overallStats.uniquePricesTraded.toLocaleString()}`);

    // Show detailed market information
    if (summary.marketSummaries.length > 0) {
      console.log(`\n🏆 MARKET DETAILS:`);
      console.log('==================');
      
      summary.marketSummaries.forEach((market, index) => {
        console.log(`\n${index + 1}. ${market.marketName}`);
        console.log(`   📍 Event: ${market.eventName}`);
        console.log(`   🆔 Market ID: ${market.marketId}`);
        console.log(`   📊 Status: ${market.marketStatus}`);
        console.log(`   ⏱️  Duration: ${market.durationMinutes} minutes`);
        console.log(`   🏃 Runners: ${market.numberOfRunners}`);
        console.log(`   💰 Total Matched: ${(market.totalMatched || 0).toLocaleString()}`);
        console.log(`   🎯 BSP Reconciled: ${market.bspReconciled ? '✅' : '❌'}`);
        
        if (market.winners.length > 0) {
          console.log(`   🏆 Winners: ${market.winners.join(', ')}`);
        }

        // Show runner performance
        const runnersByVolume = market.runnerSummaries
          .sort((a, b) => b.totalVolume - a.totalVolume)
          .slice(0, 5); // Top 5 runners

        console.log(`   📈 Top Runners by Volume:`);
        runnersByVolume.forEach((runner, idx) => {
          const winnerIcon = runner.isWinner ? '🏆' : '📊';
          const priceStr = runner.finalPrice ? `@ ${runner.finalPrice.toFixed(2)}` : 'No price';
          const bspStr = runner.bsp ? ` (BSP: ${runner.bsp.toFixed(2)})` : '';
          const volumeStr = runner.totalVolume > 0 ? runner.totalVolume.toFixed(0) : '0';
          
          console.log(`      ${idx + 1}. ${winnerIcon} ${runner.name}`);
          console.log(`          💵 ${priceStr}${bspStr}`);
          console.log(`          📊 Volume: ${volumeStr} | Turnover: ${runner.totalTurnover.toFixed(2)}`);
          
          if (runner.priceRange && runner.priceRange.trades > 0) {
            console.log(`          📈 Price Range: ${runner.priceRange.lowest.toFixed(2)} - ${runner.priceRange.highest.toFixed(2)} (${runner.priceRange.trades} trades)`);
          }
        });
      });
    }

    console.log(`\n📁 OUTPUTS:`);
    console.log(`   • JSON records: ${config.outputDirectory}/backtest_*.json`);
    console.log(`   • Summary report: ${config.outputDirectory}/backtest_summary.json`);

    console.log(`\n✅ Backtest analysis complete!`);
    console.log(`💡 You can now use this data to analyze historical market behavior,`);
    console.log(`   test trading strategies, or understand market dynamics.`);

  } catch (error) {
    console.error('\n❌ BACKTEST FAILED');
    console.error('==================');
    console.error(error);
    process.exit(1);
  }
}

// Run the backtest
if (require.main === module) {
  main().catch((error) => {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  });
}

export default main;