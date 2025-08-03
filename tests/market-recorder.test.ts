import * as fs from 'fs';
import * as path from 'path';
import {
  createMarketRecorderState,
  startRecording,
  stopRecording,
  recordRawTransmission,
  updateBasicRecord,
  createRecordingMarketChangeCallback,
  createRawDataCallback,
  getRecordingStatus,
  loadBasicRecord,
  listRecordedMarkets,
  MarketRecordingConfig,
  registerRecorderProcessCleanup,
} from '../src/market-recorder';
import {
  MarketCache,
  StreamMarketStatus,
  StreamRunnerStatus,
  MarketDefinition,
  RunnerCache,
} from '../src/betfair-exchange-stream-api-types';

// Test output directory
const TEST_OUTPUT_DIR = path.join(__dirname, 'test-recordings');

// Mock market data
const createMockMarketCache = (marketId: string, complete = false): MarketCache => {
  const marketDefinition: MarketDefinition = {
    venue: 'Test Venue',
    bspMarket: true,
    turnInPlayEnabled: true,
    persistenceEnabled: true,
    marketBaseRate: 5.0,
    eventId: 'event123',
    eventTypeId: '7',
    numberOfWinners: 1,
    bettingType: 'ODDS',
    marketType: 'WIN',
    marketTime: '2024-01-01T10:00:00.000Z',
    suspendTime: '2024-01-01T10:00:00.000Z',
    bspReconciled: complete,
    complete,
    inPlay: false,
    crossMatching: true,
    runnersVoidable: false,
    numberOfActiveRunners: 3,
    betDelay: 0,
    status: complete ? StreamMarketStatus.CLOSED : StreamMarketStatus.OPEN,
    runners: [
      {
        status: complete ? StreamRunnerStatus.WINNER : StreamRunnerStatus.ACTIVE,
        adjustmentFactor: 1.0,
        lastPriceTraded: 2.5,
        totalMatched: 1000,
        removalDate: '',
        id: 123,
        hc: 0,
        fullImage: {},
        bsp: 2.6,
      },
      {
        status: complete ? StreamRunnerStatus.LOSER : StreamRunnerStatus.ACTIVE,
        adjustmentFactor: 1.0,
        lastPriceTraded: 3.2,
        totalMatched: 800,
        removalDate: '',
        id: 456,
        hc: 0,
        fullImage: {},
        bsp: 3.1,
      },
    ],
    regulators: ['MR_INT'],
    countryCode: 'AU',
    discountAllowed: true,
    timezone: 'Australia/Sydney',
    openDate: '2024-01-01T09:00:00.000Z',
    version: 1,
    name: 'Test Race',
    eventName: 'Test Event',
    totalMatched: 5000,
  };

  const runners: { [key: string]: RunnerCache } = {
    '123': {
      id: 123,
      status: complete ? StreamRunnerStatus.WINNER : StreamRunnerStatus.ACTIVE,
      adjustmentFactor: 1.0,
      lastPriceTraded: 2.5,
      totalMatched: 1000,
      batb: [[0, 2.4, 100]],
      batl: [[0, 2.6, 150]],
      atb: [[2.4, 100]],
      atl: [[2.6, 150]],
      ltp: 2.5,
      tv: 1000,
      spn: 0,
      spf: 0,
      spb: [[2.6, 50]],
      spl: [[2.4, 60]],
      trd: [[2.5, 100]],
      fullImage: {},
    },
    '456': {
      id: 456,
      status: complete ? StreamRunnerStatus.LOSER : StreamRunnerStatus.ACTIVE,
      adjustmentFactor: 1.0,
      lastPriceTraded: 3.2,
      totalMatched: 800,
      batb: [[0, 3.1, 80]],
      batl: [[0, 3.3, 120]],
      atb: [[3.1, 80]],
      atl: [[3.3, 120]],
      ltp: 3.2,
      tv: 800,
      spn: 0,
      spf: 0,
      spb: [[3.1, 40]],
      spl: [[3.3, 30]],
      trd: [[3.2, 80]],
      fullImage: {},
    },
  };

  return {
    marketId,
    marketDefinition,
    runners,
    totalMatched: 5000,
    lastValueTraded: 2.8,
    published: Date.now(),
  };
};

describe('Market Recorder', () => {
  let config: MarketRecordingConfig;

  beforeEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    }
    
    // Create fresh test directory
    fs.mkdirSync(TEST_OUTPUT_DIR, { recursive: true });

    config = {
      outputDirectory: TEST_OUTPUT_DIR,
      enableBasicRecording: true,
      enableRawRecording: true,
      rawFilePrefix: 'raw_',
      basicFilePrefix: 'basic_',
      recordingMode: 'finite',
    };
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  test('should create market recorder state', () => {
    // Ensure the test output directory exists
    expect(fs.existsSync(TEST_OUTPUT_DIR)).toBe(true);
    
    const state = createMarketRecorderState(config);

    expect(state.config).toEqual(config);
    expect(state.rawFileStreams.size).toBe(0);
    expect(state.basicRecords.size).toBe(0);
    expect(state.isRecording).toBe(false);
    expect(fs.existsSync(TEST_OUTPUT_DIR)).toBe(true);
  });

  test('should start recording for markets', () => {
    let state = createMarketRecorderState(config);
    registerRecorderProcessCleanup(state);
    const marketIds = ['1.123', '1.456'];
    try {
      state = startRecording(state, marketIds);

      expect(state.isRecording).toBe(true);
      expect(state.rawFileStreams.size).toBe(2);
      expect(state.rawFileStreams.has('1.123')).toBe(true);
      expect(state.rawFileStreams.has('1.456')).toBe(true);

      // Verify stream objects are created and writable
      const stream1 = state.rawFileStreams.get('1.123');
      const stream2 = state.rawFileStreams.get('1.456');
      expect(stream1).toBeDefined();
      expect(stream2).toBeDefined();
      expect(stream1!.writable).toBe(true);
      expect(stream2!.writable).toBe(true);
    } finally {
      state = stopRecording(state);
    }
  });

  test('should record raw transmission data', () => {
    let state = createMarketRecorderState(config);
    registerRecorderProcessCleanup(state);
    const marketIds = ['1.123'];
    try {
      state = startRecording(state, marketIds);

      const rawData = JSON.stringify({
        op: 'mcm',
        id: 1,
        mc: [{ id: '1.123', tv: 1000 }],
      });

      // Test that recording raw transmission doesn't throw
      expect(() => recordRawTransmission(state, rawData)).not.toThrow();

      // Verify stream is still writable
      const stream = state.rawFileStreams.get('1.123');
      expect(stream).toBeDefined();
      expect(stream!.writable).toBe(true);
    } finally {
      state = stopRecording(state);
    }
  });

  test('should update basic market record', () => {
    let state = createMarketRecorderState(config);
    state = startRecording(state, ['1.123']);

    const marketCache = createMockMarketCache('1.123');
    updateBasicRecord(state, marketCache);

    expect(state.basicRecords.has('1.123')).toBe(true);
    const record = state.basicRecords.get('1.123')!;
    expect(record.marketId).toBe('1.123');
    expect(record.marketName).toBe('Test Race');
    expect(record.eventName).toBe('Test Event');
    expect(record.runners).toHaveLength(2);
    expect(record.totalMatched).toBe(5000);
  });

  test('should save basic record when market is complete', () => {
    let state = createMarketRecorderState(config);
    state = startRecording(state, ['1.123']);

    const completedMarketCache = createMockMarketCache('1.123', true);
    updateBasicRecord(state, completedMarketCache);

    // Check record was created in memory
    expect(state.basicRecords.has('1.123')).toBe(true);
    const record = state.basicRecords.get('1.123')!;
    expect(record.marketId).toBe('1.123');
    expect(record.complete).toBe(true);
    expect(record.winners).toEqual([123]); // Runner 123 is the winner
  });

  test('should create recording market change callback', () => {
    let state = createMarketRecorderState(config);
    registerRecorderProcessCleanup(state);
    state = startRecording(state, ['1.123']);
    
    let originalCallbackCalled = false;
    const originalCallback = () => {
      originalCallbackCalled = true;
    };

    const recordingCallback = createRecordingMarketChangeCallback(state, originalCallback);

    const marketCache = { '1.123': createMockMarketCache('1.123') };
    const deltas = [JSON.stringify({ op: 'mcm', id: 1, mc: [{ id: '1.123' }] })];
    try {
      recordingCallback(marketCache, deltas);

      expect(originalCallbackCalled).toBe(true);
      expect(state.basicRecords.has('1.123')).toBe(true);
    } finally {
      state = stopRecording(state);
    }
  });

  test('should create raw data callback and record raw data', () => {
    let state = createMarketRecorderState(config);
    registerRecorderProcessCleanup(state);
    state = startRecording(state, ['1.123']);
    
    const rawDataCallback = createRawDataCallback(state);
    const rawData = JSON.stringify({
      op: 'mcm',
      id: 1,
      mc: [{ id: '1.123', tv: 1000 }],
    });
    try {
      // Test that callback doesn't throw
      expect(() => rawDataCallback(rawData)).not.toThrow();

      // Verify callback is a function
      expect(typeof rawDataCallback).toBe('function');
      
      // Verify stream is still writable after callback
      const stream = state.rawFileStreams.get('1.123');
      expect(stream).toBeDefined();
      expect(stream!.writable).toBe(true);
    } finally {
      state = stopRecording(state);
    }
  });

  test('should stop recording and close streams', () => {
    let state = createMarketRecorderState(config);
    state = startRecording(state, ['1.123']);

    // Add a basic record
    const marketCache = createMockMarketCache('1.123');
    updateBasicRecord(state, marketCache);

    // Verify state before stopping
    expect(state.isRecording).toBe(true);
    expect(state.rawFileStreams.size).toBe(1);
    expect(state.basicRecords.size).toBe(1);

    state = stopRecording(state);

    expect(state.isRecording).toBe(false);
    expect(state.rawFileStreams.size).toBe(0);
    expect(state.basicRecords.size).toBe(0);
  });

  test('should get recording status', () => {
    let state = createMarketRecorderState(config);
    registerRecorderProcessCleanup(state);
    state = startRecording(state, ['1.123']);
    
    const marketCache = createMockMarketCache('1.123');
    updateBasicRecord(state, marketCache);
    try {
      const status = getRecordingStatus(state, '1.123');

      expect(status.isRecording).toBe(true);
      expect(status.hasRawStream).toBe(true);
      expect(status.hasBasicRecord).toBe(true);
      expect(status.rawFilePath).toBe(path.join(TEST_OUTPUT_DIR, 'raw_1.123.txt'));
      expect(status.basicFilePath).toBe(path.join(TEST_OUTPUT_DIR, 'basic_1.123.json'));
    } finally {
      state = stopRecording(state);
    }
  });

  test('should create basic record in memory', () => {
    let state = createMarketRecorderState(config);
    registerRecorderProcessCleanup(state);
    state = startRecording(state, ['1.123']);

    const marketCache = createMockMarketCache('1.123', true);
    try {
      updateBasicRecord(state, marketCache);

      // Verify record exists in memory state
      expect(state.basicRecords.has('1.123')).toBe(true);
      const record = state.basicRecords.get('1.123')!;
      expect(record.marketId).toBe('1.123');
      expect(record.complete).toBe(true);
    } finally {
      state = stopRecording(state);
    }
  });

  test('should track recorded markets in state', () => {
    let state = createMarketRecorderState(config);
    registerRecorderProcessCleanup(state);
    state = startRecording(state, ['1.123', '1.456']);

    // Create some records
    try {
      updateBasicRecord(state, createMockMarketCache('1.123', true));
      updateBasicRecord(state, createMockMarketCache('1.456', true));

      recordRawTransmission(state, JSON.stringify({ mc: [{ id: '1.123' }] }));

      // Verify both basic records exist in memory
      expect(state.basicRecords.has('1.123')).toBe(true);
      expect(state.basicRecords.has('1.456')).toBe(true);
      
      // Raw streams should be closed once markets complete
      expect(state.rawFileStreams.has('1.123')).toBe(false);
      expect(state.rawFileStreams.has('1.456')).toBe(false);
    } finally {
      state = stopRecording(state);
    }
  });

  test('should handle recording with only basic recording enabled', () => {
    const configBasicOnly = {
      ...config,
      enableRawRecording: false,
    };

    let state = createMarketRecorderState(configBasicOnly);
    registerRecorderProcessCleanup(state);
    try {
      state = startRecording(state, ['1.123']);

      expect(state.rawFileStreams.size).toBe(0);

      const marketCache = createMockMarketCache('1.123');
      updateBasicRecord(state, marketCache);

      expect(state.basicRecords.has('1.123')).toBe(true);
    } finally {
      state = stopRecording(state);
    }
  });

  test('should handle recording with only raw recording enabled', () => {
    const configRawOnly = {
      ...config,
      enableBasicRecording: false,
    };

    let state = createMarketRecorderState(configRawOnly);
    registerRecorderProcessCleanup(state);
    try {
      state = startRecording(state, ['1.123']);

      expect(state.rawFileStreams.size).toBe(1);

      const marketCache = createMockMarketCache('1.123');
      updateBasicRecord(state, marketCache);

      expect(state.basicRecords.has('1.123')).toBe(false);
    } finally {
      state = stopRecording(state);
    }
  });
});