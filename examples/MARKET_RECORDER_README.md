# Market Recorder Documentation

The Market Recorder functionality allows you to record Betfair market data in two different formats:

1. **Basic Recording**: Stores structured market data including BSP, winners, traded values, etc.
2. **Raw Recording**: Stores line-by-line transmissions from the Exchange Stream API in **raw format** (captured directly from the TLS stream before any processing)

## Key Features

- **True Raw Recording**: Captures data directly from the TLS stream before deserialization, ensuring no data loss
- **Market-Specific Files**: Raw data is automatically routed to market-specific files based on market ID
- **Real-time Processing**: Basic records are updated in real-time and saved when markets complete
- **Flexible Configuration**: Enable/disable recording types independently
- **Production Ready**: Handles errors gracefully and ensures no data loss
- **Robust Heartbeat**: Optimized heartbeat monitoring for long-running recordings without crashes
- **Intelligent Completion**: Automatically stops when all markets complete (finite mode) or runs forever (perpetual mode)
- **Dynamic Market Discovery**: Add new markets to existing recording sessions without interruption

## How Market Recorder Works

### Architecture Overview

The Market Recorder operates at two levels of the Betfair Exchange Stream API:

```
┌─────────────────────────────────────────────────┐
│                 Betfair Servers                 │
└─────────────────┬───────────────────────────────┘
                  │ TLS Stream
                  ▼
┌─────────────────────────────────────────────────┐
│              TLS Socket (Node.js)               │
└─────────────────┬───────────────────────────────┘
                  │ Raw JSON Strings
                  ▼
┌─────────────────────────────────────────────────┐
│           📝 RAW RECORDING LAYER                │
│     (Captures before any processing)            │
│                                                 │
│  • Intercepts at readline.on('line')            │
│  • Routes to market-specific files              │
│  • Pure string capture: {marketId}.txt          │
└─────────────────┬───────────────────────────────┘
                  │ Same Raw JSON Strings
                  ▼
┌─────────────────────────────────────────────────┐
│        🧠 STREAM DECODER & PROCESSOR            │
│                                                 │
│  • JSON.parse() and deserialization             │
│  • Market cache updates                         │
│  • Runner state tracking                        │
└─────────────────┬───────────────────────────────┘
                  │ Processed Market Objects
                  ▼
┌─────────────────────────────────────────────────┐
│         📊 BASIC RECORDING LAYER                │
│     (Structured market summaries)               │
│                                                 │
│  • Market completion detection                  │
│  • BSP extraction                               │
│  • Winner identification                        │
│  • Saves: basic_{marketId}.json                 │
└─────────────────────────────────────────────────┘
```

### Data Flow Explained

#### 1. **TLS Stream Interception** (Raw Recording)
```typescript
// In betfair-exchange-stream-api.ts
readline.on('line', (data: string) => {
  // 🔥 RAW RECORDING HAPPENS HERE FIRST
  if (state.rawDataCallback) {
    state.rawDataCallback(data); // Pure string, no processing
  }
  
  // Then continue with normal processing...
  const processedData = processDataPacket(state.streamDecoder, callbacks, data);
});
```

**What gets captured:**
- Every single line exactly as received from Betfair
- Connection messages, authentication responses, heartbeats
- Market change messages with complete market state
- No modification, parsing, or filtering

#### 2. **Market-Specific Routing**
```typescript
// In market-recorder.ts
export const recordRawTransmission = (state, rawData: string) => {
  try {
    // Parse ONLY to determine routing (not for processing)
    const parsedData = JSON.parse(rawData);
    
    if (parsedData.mc && Array.isArray(parsedData.mc)) {
      // Route to specific market files
      parsedData.mc.forEach((marketChange) => {
        const marketId = marketChange.id;
        const stream = state.rawFileStreams.get(marketId);
        if (stream) {
          stream.write(`${rawData}\n`); // Write original string
        }
      });
    } else {
      // Non-market messages go to all files
      state.rawFileStreams.forEach((stream) => {
        stream.write(`${rawData}\n`);
      });
    }
  } catch {
    // If parsing fails, write to all streams to ensure no data loss
    state.rawFileStreams.forEach((stream) => {
      stream.write(`${rawData}\n`);
    });
  }
};
```

#### 3. **Dual Recording Process**

**Raw Recording Process:**
1. **Immediate Capture**: Data intercepted at TLS level
2. **Minimal Parsing**: Only to determine market ID for file routing
3. **Direct Write**: Original JSON string written to file
4. **Continuous**: Happens for every transmission

**Basic Recording Process:**
1. **Normal Processing**: Data flows through stream decoder
2. **Cache Updates**: Market state maintained in memory
3. **Completion Detection**: Monitors for `marketDefinition.complete`
4. **Structured Export**: Saves summary when market closes

### File Output Patterns

#### Raw Files (`{marketId}.txt`)
```
{"op":"connection","connectionId":"004-120824-454836-453648"}
{"op":"status","id":"123","statusCode":"SUCCESS","connectionClosed":false}
{"op":"mcm","id":"456","initialClk":"47168","clk":"AAACJQ","conflateMs":250,"heartbeatMs":30000,"pt":1725274800000,"ct":"SUB_IMAGE","mc":[{"id":"1.246191531","marketDefinition":{"bspMarket":false,"turnInPlayEnabled":true,...},"rc":[{"batb":[[0,1.95,158.24]],"batl":[[0,1.96,161.22]],"id":22791734}],"img":true}]}
{"op":"mcm","id":"456","clk":"AAACJR","conflateMs":250,"heartbeatMs":30000,"pt":1725274801000,"ct":"SUB_IMAGE","mc":[{"id":"1.246191531","rc":[{"batb":[[0,1.94,160.82]],"id":22791734}]}]}
```

#### Basic Files (`basic_{marketId}.json`)
```json
{
  "marketId": "1.246191531",
  "marketName": "Newmarket 2nd Aug - 7f Nov Stks",
  "eventName": "Newmarket 2nd Aug",
  "marketStatus": "CLOSED",
  "complete": true,
  "totalMatched": 15432.50,
  "winners": [22791734],
  "runners": [
    {
      "id": 22791734,
      "name": "Horse Name",
      "status": "WINNER",
      "bsp": 1.95,
      "ltp": 1.94,
      "totalMatched": 8234.25
    }
  ]
}
```

### Performance & Reliability

#### Stream Optimization
- **30-second heartbeat** (vs 5-second default) for stable long recordings
- **Graceful heartbeat handling** - warnings instead of crashes
- **Robust timeout refresh** - stop/restart instead of unreliable refresh()

#### File I/O Optimization  
- **Streaming writes** - data written immediately, not buffered
- **Market-specific files** - prevents giant single files
- **Error isolation** - individual market file errors don't affect others

#### Memory Management
- **Raw recording**: Zero memory overhead (direct file writes)
- **Basic recording**: Minimal cache (only current market state)
- **Automatic cleanup**: Files closed and memory freed on stop

### Real-World Data Flow Example

Here's what happens when you record a horse race market:

#### Timeline: Pre-Race to Post-Race
```
📅 T-120min: Market opens
├── Raw: {"op":"mcm","mc":[{"id":"1.123","marketDefinition":{"status":"OPEN",...}}]}
├── Basic: Market cache initialized, status = OPEN
└── Files: 1.123.txt created, basic recording in memory

📅 T-30min: Early betting activity  
├── Raw: {"op":"mcm","mc":[{"id":"1.123","rc":[{"id":12345,"batb":[[0,3.5,100]]}]}]}
├── Basic: Runner 12345 back price updated to 3.5
└── Files: Each price change appended to 1.123.txt

📅 T-5min: Pre-race rush
├── Raw: High frequency updates (multiple per second)
├── Basic: Continuous cache updates, prices fluctuating
└── Files: Rapid appends to raw file, basic still in memory

📅 T-0min: Race starts
├── Raw: {"op":"mcm","mc":[{"id":"1.123","marketDefinition":{"inPlay":true}}]}
├── Basic: inPlay = true, market becomes in-play
└── Files: In-play status captured in raw stream

📅 T+2min: Race finishes
├── Raw: {"op":"mcm","mc":[{"id":"1.123","marketDefinition":{"complete":true},"rc":[{"id":12345,"status":"WINNER"}]}]}
├── Basic: Market completion detected, winner identified
└── Files: basic_1.123.json SAVED with final results
```

#### What Each File Contains After Recording

**Raw File (`1.123.txt`) - 2,847 lines:**
- Connection establishment (5 lines)
- Authentication flow (3 lines)  
- Market subscription (2 lines)
- Pre-race price movements (1,200 lines)
- In-play updates (800 lines)
- Post-race settlement (837 lines)

**Basic File (`basic_1.123.json`) - Complete Summary:**
- Market metadata (name, event, timing)
- Final total matched: $287,432.50
- Winner: Runner 12345 (final BSP: 3.2)
- All runner final states and prices

## Quick Start

```typescript
import {
  createMarketRecorderState,
  startRecording,
  createRecordingMarketChangeCallback,
  MarketRecordingConfig,
} from 'betfair-node';

// Configure recording
const config: MarketRecordingConfig = {
  outputDirectory: './recordings',
  enableBasicRecording: true,
  enableRawRecording: true,
  rawFilePrefix: 'raw_',
  basicFilePrefix: 'basic_',
};

// Initialize recorder
let recorderState = createMarketRecorderState(config);

// Start recording for specific markets
const marketIds = ['1.123456789', '1.987654321'];
recorderState = startRecording(recorderState, marketIds);

// Create callback that handles recording
const callback = createRecordingMarketChangeCallback(recorderState);

// Use with stream API...
```

## Configuration Options

### MarketRecordingConfig

| Property | Type | Description |
|----------|------|-------------|
| `outputDirectory` | string | Directory where recordings will be saved |
| `enableBasicRecording` | boolean | Enable structured market data recording |
| `enableRawRecording` | boolean | Enable raw transmission recording |
| `rawFilePrefix` | string? | Prefix for raw recording files (default: "") |
| `basicFilePrefix` | string? | Prefix for basic recording files (default: "basic_") |
| `recordingMode` | 'finite' \| 'perpetual'? | Recording mode: finite stops when all markets complete, perpetual runs forever (default: "finite") |
| `onAllMarketsComplete` | () => void? | Callback triggered when all finite markets are complete |

## File Output Formats

### Raw Recording Files
- **Filename**: `{rawFilePrefix}{marketId}.txt`
- **Example**: `raw_1.123456789.txt`
- **Format**: Each line contains raw JSON from Betfair Exchange Stream API (includes Betfair's own timestamps)

```
# Raw market data for market: 1.123456789
# Started at: 2024-01-01T10:00:00.000Z
# Format: Each line contains raw JSON transmission from Betfair Exchange Stream API

{"op":"connection","connectionId":"123-456"}
{"op":"status","id":"1","statusCode":"SUCCESS","connectionClosed":false}
{"op":"mcm","id":"2","initialClk":"123","clk":"124","conflateMs":0,"heartbeatMs":5000,"pt":1641024003000,"ct":"SUB_IMAGE","mc":[{"id":"1.123456789","marketDefinition":{"bspMarket":false,"turnInPlayEnabled":true},"rc":[{"batb":[[1,2.5,10.5]],"batl":[[1,2.52,10.34]],"id":47972}],"img":true}]}
```

### Basic Recording Files
- **Filename**: `{basicFilePrefix}{marketId}.json`
- **Example**: `basic_1.123456789.json`
- **Format**: Structured JSON with market summary and runner information

```json
{
  "marketId": "1.123456789",
  "marketName": "2:30 Flemington",
  "eventName": "Flemington 1st Jan",
  "marketStatus": "CLOSED",
  "marketTime": "2024-01-01T02:30:00.000Z",
  "openDate": "2024-01-01T02:00:00.000Z",
  "totalMatched": 150000.50,
  "inPlay": false,
  "bspReconciled": true,
  "complete": true,
  "numberOfWinners": 1,
  "runners": [
    {
      "id": 47972,
      "name": "Horse Name",
      "status": "WINNER",
      "adjustmentFactor": 1.0,
      "lastPriceTraded": 2.50,
      "totalMatched": 50000.25,
      "bsp": 2.52,
      "ltp": 2.50,
      "tv": 50000.25,
      "spn": 2.48,
      "spf": 2.54,
      "finalStatus": "WINNER",
      "isWinner": true
    }
  ],
  "recordedAt": "2024-01-01T10:00:00.000Z",
  "finalTotalMatched": 150000.50,
  "winners": [47972],
  "recordingMetadata": {
    "version": "1.0",
    "createdAt": "2024-01-01T02:35:00.000Z",
    "recordingType": "basic"
  }
}
```

## Main Functions

### `createMarketRecorderState(config)`
Creates initial recorder state with specified configuration.

```typescript
const recorderState = createMarketRecorderState({
  outputDirectory: './recordings',
  enableBasicRecording: true,
  enableRawRecording: true,
});
```

### `startRecording(state, marketIds)`
Starts recording for specified market IDs.

```typescript
recorderState = startRecording(recorderState, ['1.123', '1.456']);
```

### `stopRecording(state)`
Stops recording and saves all data to files.

```typescript
recorderState = stopRecording(recorderState);
```

### `createRecordingMarketChangeCallback(state, originalCallback?)`
Creates a market change callback that handles both recording types.

```typescript
// For pure raw recording without any processing
const callback = createRecordingMarketChangeCallback(recorderState);

// Or with custom processing (defeats the "raw" purpose)
const callbackWithProcessing = createRecordingMarketChangeCallback(
  recorderState,
  (marketCache, deltas) => {
    // Your custom callback logic here (not recommended for pure raw recording)
    console.log('Market updated:', Object.keys(marketCache));
  }
);
```

### `getRecordingStatus(state, marketId)`
Gets current recording status for a market.

```typescript
const status = getRecordingStatus(recorderState, '1.123456789');
console.log('Recording:', status.isRecording);
console.log('Raw file:', status.rawFilePath);
console.log('Basic file:', status.basicFilePath);
```

### `loadBasicRecord(config, marketId)`
Loads a previously saved basic market record.

```typescript
const record = loadBasicRecord(config, '1.123456789');
if (record) {
  console.log('Winners:', record.winners);
  console.log('Total matched:', record.totalMatched);
}
```

### `listRecordedMarkets(config)`
Lists all recorded markets in the output directory.

```typescript
const { basicRecords, rawRecords } = listRecordedMarkets(config);
console.log('Basic records:', basicRecords);
console.log('Raw records:', rawRecords);
```

### `getRecordingCompletionStatus(state)`
Gets completion status for all markets being recorded.

```typescript
const status = getRecordingCompletionStatus(recorderState);
console.log(`Progress: ${status.completedMarkets}/${status.totalMarkets} markets completed`);
console.log('Pending markets:', status.pendingMarkets);
console.log('All complete:', status.isAllComplete);
console.log('Recording mode:', status.recordingMode);
```

### `addMarketsToRecording(state, marketIds)`
Adds new markets to an existing recording session.

```typescript
// Add newly discovered markets without stopping current recording
recorderState = addMarketsToRecording(recorderState, ['1.111', '1.222']);
```

## Complete Examples

### Finite Recording (`market-recorder-example.ts`)
Records specific markets until they all complete, then stops automatically:

1. Authenticates with Betfair
2. Finds 3 horse racing markets
3. Sets up finite recording mode
4. Connects to the stream
5. Records until all markets complete
6. Exits automatically when done

```bash
npm run example:recorder
```

### Simple Recording (`simple-market-recorder.ts`)
Quick example with two modes:

```bash
npm run example:recorder-simple           # Finite mode - stops when markets complete
npm run example:recorder-simple --timeout # Timeout mode - stops after 30 seconds
```

### Perpetual Recording (`perpetual-greyhound-recorder.ts`)
Continuously records ALL greyhound markets as they become available:

1. Connects to stream in perpetual mode
2. Automatically discovers new greyhound markets every 5 minutes
3. Adds new markets to existing recording session
4. Runs forever until manually stopped
5. Perfect for building comprehensive greyhound databases

```bash
npm run example:recorder-perpetual
```

## Use Cases

### Basic Recording
Perfect for:
- Post-race analysis
- Building historical databases
- Tracking market outcomes
- BSP analysis
- Winner/loser statistics

### Raw Recording
Perfect for:
- Market replay functionality
- Detailed tick-by-tick analysis
- Building custom market processors
- Debugging market data issues
- Creating market simulators

## File Management

- Files are created automatically when recording starts
- Basic records are saved immediately when markets complete
- Raw files are written to continuously during recording
- Use `listRecordedMarkets()` to discover existing recordings
- Files use market ID as the primary identifier for easy organization

## Performance Considerations

- Raw recording writes to disk continuously - ensure adequate disk space
- Basic recording keeps data in memory until market completion
- For high-volume recording, consider using SSD storage
- Monitor disk space when recording many markets simultaneously

## Error Handling

The recorder handles various error conditions gracefully:
- Missing output directories are created automatically
- Failed file writes are logged but don't stop recording
- Invalid market data is handled with sensible defaults
- Stream disconnections don't affect saved data