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

    config = {
      outputDirectory: TEST_OUTPUT_DIR,
      enableBasicRecording: true,
      enableRawRecording: true,
      rawFilePrefix: 'raw_',
      basicFilePrefix: 'basic_',
    };
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(TEST_OUTPUT_DIR)) {
      fs.rmSync(TEST_OUTPUT_DIR, { recursive: true, force: true });
    }
  });

  test('should create market recorder state', () => {
    const state = createMarketRecorderState(config);

    expect(state.config).toEqual(config);
    expect(state.rawFileStreams.size).toBe(0);
    expect(state.basicRecords.size).toBe(0);
    expect(state.isRecording).toBe(false);
    expect(fs.existsSync(TEST_OUTPUT_DIR)).toBe(true);
  });

  test('should start recording for markets', () => {
    let state = createMarketRecorderState(config);
    const marketIds = ['1.123', '1.456'];

    state = startRecording(state, marketIds);

    expect(state.isRecording).toBe(true);
    expect(state.rawFileStreams.size).toBe(2);
    expect(state.rawFileStreams.has('1.123')).toBe(true);
    expect(state.rawFileStreams.has('1.456')).toBe(true);

    // Check files were created
    expect(fs.existsSync(path.join(TEST_OUTPUT_DIR, 'raw_1.123.txt'))).toBe(true);
    expect(fs.existsSync(path.join(TEST_OUTPUT_DIR, 'raw_1.456.txt'))).toBe(true);
  });

  test('should record raw transmission data', () => {
    let state = createMarketRecorderState(config);
    const marketIds = ['1.123'];

    state = startRecording(state, marketIds);

    const rawData = JSON.stringify({
      op: 'mcm',
      id: 1,
      mc: [{ id: '1.123', tv: 1000 }],
    });

    recordRawTransmission(state, rawData);

    // Check file content
    const filePath = path.join(TEST_OUTPUT_DIR, 'raw_1.123.txt');
    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain(rawData);
    expect(content).toContain('# Raw market data for market: 1.123');
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

    // Check file was saved
    const filePath = path.join(TEST_OUTPUT_DIR, 'basic_1.123.json');
    expect(fs.existsSync(filePath)).toBe(true);

    const savedRecord = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    expect(savedRecord.marketId).toBe('1.123');
    expect(savedRecord.complete).toBe(true);
    expect(savedRecord.winners).toEqual([123]); // Runner 123 is the winner
  });

  test('should create recording market change callback', () => {
    let state = createMarketRecorderState(config);
    state = startRecording(state, ['1.123']);

    let originalCallbackCalled = false;
    const originalCallback = () => {
      originalCallbackCalled = true;
    };

    const recordingCallback = createRecordingMarketChangeCallback(state, originalCallback);

    const marketCache = { '1.123': createMockMarketCache('1.123') };
    const deltas = [JSON.stringify({ op: 'mcm', id: 1, mc: [{ id: '1.123' }] })];

    recordingCallback(marketCache, deltas);

    expect(originalCallbackCalled).toBe(true);
    expect(state.basicRecords.has('1.123')).toBe(true);
  });

  test('should create raw data callback and record raw data', () => {
    let state = createMarketRecorderState(config);
    state = startRecording(state, ['1.123']);

    const rawDataCallback = createRawDataCallback(state);
    const rawData = JSON.stringify({
      op: 'mcm',
      id: 1,
      mc: [{ id: '1.123', tv: 1000 }],
    });

    rawDataCallback(rawData);

    // Check raw file was written
    const rawFile = path.join(TEST_OUTPUT_DIR, 'raw_1.123.txt');
    const content = fs.readFileSync(rawFile, 'utf-8');
    expect(content).toContain('mcm');
    expect(content).toContain('1.123');
  });

  test('should stop recording and close streams', () => {
    let state = createMarketRecorderState(config);
    state = startRecording(state, ['1.123']);

    // Add a basic record
    const marketCache = createMockMarketCache('1.123');
    updateBasicRecord(state, marketCache);

    state = stopRecording(state);

    expect(state.isRecording).toBe(false);
    expect(state.rawFileStreams.size).toBe(0);
    expect(state.basicRecords.size).toBe(0);

    // Check basic record was saved
    const basicFile = path.join(TEST_OUTPUT_DIR, 'basic_1.123.json');
    expect(fs.existsSync(basicFile)).toBe(true);
  });

  test('should get recording status', () => {
    let state = createMarketRecorderState(config);
    state = startRecording(state, ['1.123']);

    const marketCache = createMockMarketCache('1.123');
    updateBasicRecord(state, marketCache);

    const status = getRecordingStatus(state, '1.123');

    expect(status.isRecording).toBe(true);
    expect(status.hasRawStream).toBe(true);
    expect(status.hasBasicRecord).toBe(true);
    expect(status.rawFilePath).toBe(path.join(TEST_OUTPUT_DIR, 'raw_1.123.txt'));
    expect(status.basicFilePath).toBe(path.join(TEST_OUTPUT_DIR, 'basic_1.123.json'));
  });

  test('should load basic record from file', () => {
    let state = createMarketRecorderState(config);
    state = startRecording(state, ['1.123']);

    const marketCache = createMockMarketCache('1.123', true);
    updateBasicRecord(state, marketCache);

    const loadedRecord = loadBasicRecord(config, '1.123');

    expect(loadedRecord).not.toBeNull();
    expect(loadedRecord!.marketId).toBe('1.123');
    expect(loadedRecord!.complete).toBe(true);
  });

  test('should list recorded markets', () => {
    let state = createMarketRecorderState(config);
    state = startRecording(state, ['1.123', '1.456']);

    // Create some records
    updateBasicRecord(state, createMockMarketCache('1.123', true));
    updateBasicRecord(state, createMockMarketCache('1.456', true));

    recordRawTransmission(state, JSON.stringify({ mc: [{ id: '1.123' }] }));

    const listed = listRecordedMarkets(config);

    expect(listed.basicRecords).toContain('1.123');
    expect(listed.basicRecords).toContain('1.456');
    expect(listed.rawRecords).toContain('1.123');
    expect(listed.rawRecords).toContain('1.456');
  });

  test('should handle recording with only basic recording enabled', () => {
    const configBasicOnly = {
      ...config,
      enableRawRecording: false,
    };

    let state = createMarketRecorderState(configBasicOnly);
    state = startRecording(state, ['1.123']);

    expect(state.rawFileStreams.size).toBe(0);

    const marketCache = createMockMarketCache('1.123');
    updateBasicRecord(state, marketCache);

    expect(state.basicRecords.has('1.123')).toBe(true);
  });

  test('should handle recording with only raw recording enabled', () => {
    const configRawOnly = {
      ...config,
      enableBasicRecording: false,
    };

    let state = createMarketRecorderState(configRawOnly);
    state = startRecording(state, ['1.123']);

    expect(state.rawFileStreams.size).toBe(1);

    const marketCache = createMockMarketCache('1.123');
    updateBasicRecord(state, marketCache);

    expect(state.basicRecords.has('1.123')).toBe(false);
  });
});