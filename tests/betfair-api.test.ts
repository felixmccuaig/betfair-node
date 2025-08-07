import {
  createBetfairApiState,
  login,
  logout,
  keepAlive,
  listMarketCatalogue,
  listMarketBook,
  listEventTypes,
  listCompetitions,
  placeOrders,
  listCurrencyRates,
  ensureAuthenticated,
  isAuthenticated,
  findCurrencyRate,
  listCurrentOrders,
  listClearedOrders,
  cancelOrders,
  replaceOrders,
  updateOrders,
  betfairStandardizeLocation,
  createCancelInstruction,
  createReplaceInstruction,
  createUpdateInstruction,
  isValidBetId,
  calculateBackProfit,
  calculateLayLiability,
  validateOrderParameters,
  getComprehensiveMarketResults,
  BetfairApiState,
} from '../src/betfair-api';

import {
  MarketFilter,
  MarketSort,
  PlaceInstruction,
  OrderType,
  PersistenceType,
  OrderProjection,
  BetStatus,
  Side,
  OrderBy,
  GroupBy,
  CancelInstruction,
  ReplaceInstruction,
  UpdateInstruction,
  ComprehensiveMarketResults,
  MarketProjection,
} from '../src/betfair-api-types';

import { CurrencyRate, MarketCache } from '../src/betfair-exchange-stream-api-types';
import axios from 'axios';

// Mock dependencies
jest.mock('querystring', () => ({
  stringify: jest.fn((obj) => Object.keys(obj).map(key => `${key}=${obj[key]}`).join('&')),
}));

jest.mock('axios');
const mockedAxios = jest.mocked(axios);

describe('Betfair API Functional Implementation', () => {
  let apiState: BetfairApiState;
  const mockMarketChangeCallback = jest.fn((marketCache: { [key: string]: MarketCache }, deltas: string[]) => {
    console.log('Market change:', marketCache, deltas);
  });

  beforeEach(() => {
    apiState = createBetfairApiState(
      'en',
      'AUD',
      500,
      500,
      mockMarketChangeCallback
    );
    jest.clearAllMocks();
  });

  describe('createBetfairApiState', () => {
    it('should create initial API state with correct parameters', () => {
      expect(apiState.locale).toBe('en');
      expect(apiState.targetCurrency).toBe('AUD');
      expect(apiState.conflateMs).toBe(500);
      expect(apiState.heartbeatMs).toBe(500);
      expect(apiState.marketChangeCallback).toBe(mockMarketChangeCallback);
      expect(apiState.sessionKey).toBeUndefined();
      expect(apiState.appKey).toBeUndefined();
    });
  });

  describe('Authentication Functions', () => {
    describe('isAuthenticated', () => {
      it('should return false for unauthenticated state', () => {
        expect(isAuthenticated(apiState)).toBe(false);
      });

      it('should return true when both sessionKey and appKey are present', () => {
        const authenticatedState = {
          ...apiState,
          sessionKey: 'test-session',
          appKey: 'test-app-key',
        };
        expect(isAuthenticated(authenticatedState)).toBe(true);
      });

      it('should return false when only sessionKey is present', () => {
        const partialState = {
          ...apiState,
          sessionKey: 'test-session',
        };
        expect(isAuthenticated(partialState)).toBe(false);
      });
    });

    describe('ensureAuthenticated', () => {
      it('should throw error when not authenticated', () => {
        expect(() => ensureAuthenticated(apiState)).toThrow('Not authenticated. Call login() first.');
      });

      it('should return credentials when authenticated', () => {
        const authenticatedState = {
          ...apiState,
          sessionKey: 'test-session',
          appKey: 'test-app-key',
        };
        const credentials = ensureAuthenticated(authenticatedState);
        expect(credentials).toEqual({
          sessionKey: 'test-session',
          appKey: 'test-app-key',
        });
      });
    });

    describe('login', () => {
      it('should successfully authenticate and update state', async () => {
        const mockAuthResponse = {
          data: {
            status: 'SUCCESS',
            token: 'test-token',
          },
        };

        const mockCurrencyResponse = {
          status: 200,
          data: {
            result: [
              { currencyCode: 'AUD', rate: 1.0 },
              { currencyCode: 'USD', rate: 0.75 },
            ],
          },
        };

        mockedAxios.mockResolvedValueOnce(mockAuthResponse);
        mockedAxios.mockResolvedValueOnce(mockCurrencyResponse);

        const updatedState = await login(apiState, 'test-app-key', 'username', 'password');

        expect(updatedState.appKey).toBe('test-app-key');
        expect(updatedState.sessionKey).toBe('test-token');
        expect(updatedState.currencyRates).toHaveLength(2);
        expect(mockedAxios).toHaveBeenCalledTimes(2);
      });

      it('should throw error on failed authentication', async () => {
        const mockAuthResponse = {
          data: {
            status: 'FAILURE',
          },
        };

        mockedAxios.mockResolvedValueOnce(mockAuthResponse);

        await expect(login(apiState, 'test-app-key', 'username', 'password'))
          .rejects.toThrow('Login failed');
      });

      it('should throw error when currency rates fail to load', async () => {
        const mockAuthResponse = {
          data: {
            status: 'SUCCESS',
            token: 'test-token',
          },
        };

        const mockCurrencyResponse = {
          status: 500,
        };

        mockedAxios.mockResolvedValueOnce(mockAuthResponse);
        mockedAxios.mockResolvedValueOnce(mockCurrencyResponse);

        await expect(login(apiState, 'test-app-key', 'username', 'password'))
          .rejects.toThrow('Error listing currency rates');
      });
    });

    describe('logout', () => {
      it('should make correct logout request', async () => {
        const mockResponse = { data: { status: 'SUCCESS' } };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        await logout('test-session');

        expect(mockedAxios).toHaveBeenCalledWith({
          method: 'post',
          url: 'https://identitysso.betfair.com.au:443/api/logout',
          headers: {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded',
            'content-length': expect.any(Number),
            'x-authentication': 'test-session',
          },
          data: expect.any(String),
        });
      });
    });

    describe('keepAlive', () => {
      it('should make correct keep alive request', async () => {
        const mockResponse = { data: { status: 'SUCCESS' } };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        await keepAlive('test-session');

        expect(mockedAxios).toHaveBeenCalledWith({
          method: 'post',
          url: 'https://identitysso.betfair.com.au:443/api/keepAlive',
          headers: {
            accept: 'application/json',
            'content-type': 'application/x-www-form-urlencoded',
            'content-length': expect.any(Number),
            'x-authentication': 'test-session',
          },
          data: expect.any(String),
        });
      });
    });
  });

  describe('Market Data Functions', () => {
    let authenticatedState: BetfairApiState;

    beforeEach(() => {
      authenticatedState = {
        ...apiState,
        sessionKey: 'test-session',
        appKey: 'test-app-key',
      };
    });

    describe('listMarketCatalogue', () => {
      it('should make correct API request', async () => {
        const mockResponse = { data: { result: [] } };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        const filter: MarketFilter = {
          eventTypeIds: ['1'],
        };

        await listMarketCatalogue(
          authenticatedState,
          filter,
          ['COMPETITION'],
          MarketSort.FIRST_TO_START,
          10
        );

        expect(mockedAxios).toHaveBeenCalledWith({
          method: 'post',
          url: 'https://api.betfair.com:443/exchange/betting/json-rpc/v1',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'content-length': expect.any(Number),
            'x-authentication': 'test-session',
            'x-application': 'test-app-key',
          },
          data: expect.stringContaining('listMarketCatalogue'),
        });
      });

      it('should throw error when not authenticated', async () => {
        const filter: MarketFilter = { eventTypeIds: ['1'] };

        await expect(
          listMarketCatalogue(apiState, filter, [], MarketSort.FIRST_TO_START, 10)
        ).rejects.toThrow('Not authenticated. Call login() first.');
      });
    });

    describe('listMarketBook', () => {
      it('should make correct API request', async () => {
        const mockResponse = { data: { result: [] } };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        const params = {
          marketIds: ['1.123456'],
          priceProjection: { priceData: ['EX_BEST_OFFERS'] },
        };

        await listMarketBook(authenticatedState, params);

        expect(mockedAxios).toHaveBeenCalledWith({
          method: 'post',
          url: 'https://api.betfair.com:443/exchange/betting/json-rpc/v1',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'content-length': expect.any(Number),
            'x-authentication': 'test-session',
            'x-application': 'test-app-key',
          },
          data: expect.stringContaining('listMarketBook'),
        });
      });
    });

    describe('listEventTypes', () => {
      it('should make correct API request', async () => {
        const mockResponse = { data: { result: [] } };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        const filter: MarketFilter = {};

        await listEventTypes(authenticatedState, filter);

        expect(mockedAxios).toHaveBeenCalledWith({
          method: 'post',
          url: 'https://api.betfair.com:443/exchange/betting/json-rpc/v1',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'content-length': expect.any(Number),
            'x-authentication': 'test-session',
            'x-application': 'test-app-key',
          },
          data: expect.stringContaining('listEventTypes'),
        });
      });
    });
  });

  describe('Betting Functions', () => {
    let authenticatedState: BetfairApiState;

    beforeEach(() => {
      authenticatedState = {
        ...apiState,
        sessionKey: 'test-session',
        appKey: 'test-app-key',
      };
    });

    describe('placeOrders', () => {
      it('should make correct API request', async () => {
        const mockResponse = { data: { result: { status: 'SUCCESS' } } };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        const instructions: PlaceInstruction[] = [
          {
            orderType: OrderType.LIMIT,
            selectionId: 123456,
            side: 'B',
            limitOrder: {
              size: 10,
              price: 2.0,
              persistenceType: PersistenceType.LAPSE,
            },
          },
        ];

        await placeOrders(
          authenticatedState,
          '1.123456',
          instructions,
          'test-ref',
          1,
          'strategy-ref',
          false
        );

        expect(mockedAxios).toHaveBeenCalledWith({
          method: 'post',
          url: 'https://api.betfair.com:443/exchange/betting/json-rpc/v1',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'content-length': expect.any(Number),
            'x-authentication': 'test-session',
            'x-application': 'test-app-key',
          },
          data: expect.stringContaining('placeOrders'),
        });
      });
    });
  });

  describe('Account Functions', () => {
    let authenticatedState: BetfairApiState;

    beforeEach(() => {
      authenticatedState = {
        ...apiState,
        sessionKey: 'test-session',
        appKey: 'test-app-key',
      };
    });

    describe('listCurrencyRates', () => {
      it('should make correct API request', async () => {
        const mockResponse = { data: { result: [] } };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        await listCurrencyRates(authenticatedState, 'GBP');

        expect(mockedAxios).toHaveBeenCalledWith({
          method: 'post',
          url: 'https://api.betfair.com/exchange/account/json-rpc/v1',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'content-length': expect.any(Number),
            'x-authentication': 'test-session',
            'x-application': 'test-app-key',
          },
          data: expect.stringContaining('listCurrencyRates'),
        });
      });
    });
  });

  describe('Utility Functions', () => {
    describe('findCurrencyRate', () => {
      it('should find currency rate by code', () => {
        const rates: CurrencyRate[] = [
          { currencyCode: 'AUD', rate: 1.0 },
          { currencyCode: 'USD', rate: 0.75 },
          { currencyCode: 'EUR', rate: 0.85 },
        ];

        const audRate = findCurrencyRate(rates, 'AUD');
        expect(audRate).toEqual({ currencyCode: 'AUD', rate: 1.0 });

        const usdRate = findCurrencyRate(rates, 'USD');
        expect(usdRate).toEqual({ currencyCode: 'USD', rate: 0.75 });
      });

      it('should return undefined for non-existent currency', () => {
        const rates: CurrencyRate[] = [
          { currencyCode: 'AUD', rate: 1.0 },
        ];

        const result = findCurrencyRate(rates, 'JPY');
        expect(result).toBeUndefined();
      });

      it('should handle empty rates array', () => {
        const result = findCurrencyRate([], 'AUD');
        expect(result).toBeUndefined();
      });
    });
  });

  describe('Order Management Functions', () => {
    let authenticatedState: BetfairApiState;

    beforeEach(() => {
      authenticatedState = {
        ...apiState,
        sessionKey: 'test-session',
        appKey: 'test-app-key',
      };
    });

    describe('listCurrentOrders', () => {
      it('should make correct API request with default parameters', async () => {
        const mockResponse = { data: { result: [] } };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        await listCurrentOrders(authenticatedState);

        expect(mockedAxios).toHaveBeenCalledWith({
          method: 'post',
          url: 'https://api.betfair.com:443/exchange/betting/json-rpc/v1',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'content-length': expect.any(Number),
            'x-authentication': 'test-session',
            'x-application': 'test-app-key',
          },
          data: expect.stringContaining('listCurrentOrders'),
        });
      });

      it('should include optional parameters when provided', async () => {
        const mockResponse = { data: { result: [] } };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        await listCurrentOrders(
          authenticatedState,
          ['12345'],
          ['1.123456'],
          OrderProjection.EXECUTABLE,
          { from: '2023-01-01', to: '2023-01-31' },
          OrderBy.BY_PLACED_TIME,
          undefined,
          0,
          100
        );

        const axiosCall = mockedAxios.mock.calls[0]?.[0] as any;
        if (axiosCall && typeof axiosCall.data === 'string') {
          const callData = JSON.parse(axiosCall.data);
          expect(callData.params.betIds).toEqual(['12345']);
          expect(callData.params.marketIds).toEqual(['1.123456']);
          expect(callData.params.orderProjection).toBe('EXECUTABLE');
          expect(callData.params.placedDateRange).toEqual({ from: '2023-01-01', to: '2023-01-31' });
        }
      });
    });

    describe('listClearedOrders', () => {
      it('should make correct API request with default parameters', async () => {
        const mockResponse = { data: { result: [] } };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        await listClearedOrders(authenticatedState);

        expect(mockedAxios).toHaveBeenCalledWith({
          method: 'post',
          url: 'https://api.betfair.com:443/exchange/betting/json-rpc/v1',
          headers: {
            accept: 'application/json',
            'content-type': 'application/json',
            'content-length': expect.any(Number),
            'x-authentication': 'test-session',
            'x-application': 'test-app-key',
          },
          data: expect.stringContaining('listClearedOrders'),
        });
      });

      it('should include optional parameters when provided', async () => {
        const mockResponse = { data: { result: [] } };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        await listClearedOrders(
          authenticatedState,
          BetStatus.SETTLED,
          ['1'],
          ['29123456'],
          ['1.123456'],
          [123456],
          ['12345'],
          Side.BACK,
          { from: '2023-01-01', to: '2023-01-31' },
          GroupBy.MARKET,
          true,
          0,
          100
        );

        const axiosCall = mockedAxios.mock.calls[0]?.[0] as any;
        if (axiosCall && typeof axiosCall.data === 'string') {
          const callData = JSON.parse(axiosCall.data);
          expect(callData.params.betStatus).toBe('SETTLED');
          expect(callData.params.eventTypeIds).toEqual(['1']);
          expect(callData.params.side).toBe('BACK');
          expect(callData.params.groupBy).toBe('MARKET');
        }
      });
    });

    describe('cancelOrders', () => {
      it('should make correct API request', async () => {
        const mockResponse = { data: { result: { status: 'SUCCESS' } } };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        const instructions: CancelInstruction[] = [
          { betId: '12345' },
          { betId: '67890', sizeReduction: 5.0 },
        ];

        await cancelOrders(authenticatedState, '1.123456', instructions);

        const axiosCall = mockedAxios.mock.calls[0]?.[0] as any;
        if (axiosCall && typeof axiosCall.data === 'string') {
          const callData = JSON.parse(axiosCall.data);
          expect(callData.params.marketId).toBe('1.123456');
          expect(callData.params.instructions).toEqual(instructions);
        }
      });

      it('should throw error when no instructions provided', async () => {
        await expect(
          cancelOrders(authenticatedState, '1.123456', [])
        ).rejects.toThrow('Cancel instructions are required');
      });

      it('should throw error when too many instructions provided', async () => {
        const tooManyInstructions = Array.from({ length: 61 }, (_, i) => ({
          betId: i.toString(),
        }));

        await expect(
          cancelOrders(authenticatedState, '1.123456', tooManyInstructions)
        ).rejects.toThrow('Maximum 60 cancel instructions allowed per request');
      });
    });

    describe('replaceOrders', () => {
      it('should make correct API request', async () => {
        const mockResponse = { data: { result: { status: 'SUCCESS' } } };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        const instructions: ReplaceInstruction[] = [
          { betId: '12345', newPrice: 2.5 },
        ];

        await replaceOrders(
          authenticatedState,
          '1.123456',
          instructions,
          'customer-ref',
          1,
          false
        );

        const axiosCall = mockedAxios.mock.calls[0]?.[0] as any;
        if (axiosCall && typeof axiosCall.data === 'string') {
          const callData = JSON.parse(axiosCall.data);
          expect(callData.params.marketId).toBe('1.123456');
          expect(callData.params.instructions).toEqual(instructions);
          expect(callData.params.customerRef).toBe('customer-ref');
          expect(callData.params.marketVersion).toBe(1);
          expect(callData.params.async).toBe(false);
        }
      });

      it('should throw error when no instructions provided', async () => {
        await expect(
          replaceOrders(authenticatedState, '1.123456', [])
        ).rejects.toThrow('Replace instructions are required');
      });
    });

    describe('updateOrders', () => {
      it('should make correct API request', async () => {
        const mockResponse = { data: { result: { status: 'SUCCESS' } } };
        mockedAxios.mockResolvedValueOnce(mockResponse);

        const instructions: UpdateInstruction[] = [
          { betId: '12345', newPersistenceType: PersistenceType.PERSIST },
        ];

        await updateOrders(authenticatedState, '1.123456', instructions);

        const axiosCall = mockedAxios.mock.calls[0]?.[0] as any;
        if (axiosCall && typeof axiosCall.data === 'string') {
          const callData = JSON.parse(axiosCall.data);
          expect(callData.params.marketId).toBe('1.123456');
          expect(callData.params.instructions).toEqual(instructions);
        }
      });

      it('should throw error when no instructions provided', async () => {
        await expect(
          updateOrders(authenticatedState, '1.123456', [])
        ).rejects.toThrow('Update instructions are required');
      });
    });
  });

  describe('Utility Functions', () => {
    describe('betfairStandardizeLocation', () => {
      it('should standardize location names', () => {
        expect(betfairStandardizeLocation('  london  ')).toBe('London');
        expect(betfairStandardizeLocation('new york')).toBe('New York');
        expect(betfairStandardizeLocation('san-francisco!')).toBe('Sanfrancisco');
        expect(betfairStandardizeLocation('MELBOURNE')).toBe('Melbourne');
      });

      it('should handle special characters', () => {
        expect(betfairStandardizeLocation('côte d\'azur')).toBe('Cte Dazur');
        expect(betfairStandardizeLocation('saint-étienne')).toBe('Sainttienne');
      });
    });

    describe('createCancelInstruction', () => {
      it('should create basic cancel instruction', () => {
        const instruction = createCancelInstruction('12345');
        expect(instruction).toEqual({ betId: '12345' });
      });

      it('should include size reduction when provided', () => {
        const instruction = createCancelInstruction('12345', 5.0);
        expect(instruction).toEqual({ betId: '12345', sizeReduction: 5.0 });
      });
    });

    describe('createReplaceInstruction', () => {
      it('should create replace instruction', () => {
        const instruction = createReplaceInstruction('12345', 2.5);
        expect(instruction).toEqual({ betId: '12345', newPrice: 2.5 });
      });
    });

    describe('createUpdateInstruction', () => {
      it('should create update instruction', () => {
        const instruction = createUpdateInstruction('12345', PersistenceType.PERSIST);
        expect(instruction).toEqual({
          betId: '12345',
          newPersistenceType: PersistenceType.PERSIST,
        });
      });
    });

    describe('isValidBetId', () => {
      it('should validate correct bet IDs', () => {
        expect(isValidBetId('12345')).toBe(true);
        expect(isValidBetId('999999999')).toBe(true);
        expect(isValidBetId('1')).toBe(true);
      });

      it('should reject invalid bet IDs', () => {
        expect(isValidBetId('abc123')).toBe(false);
        expect(isValidBetId('123.45')).toBe(false);
        expect(isValidBetId('')).toBe(false);
        expect(isValidBetId('123abc')).toBe(false);
      });
    });

    describe('calculateBackProfit', () => {
      it('should calculate back bet profit correctly', () => {
        expect(calculateBackProfit(10, 2.0)).toBe(10); // £10 stake at 2.0 = £10 profit
        expect(calculateBackProfit(20, 3.5)).toBe(50); // £20 stake at 3.5 = £50 profit
        expect(calculateBackProfit(5, 1.5)).toBe(2.5); // £5 stake at 1.5 = £2.50 profit
      });

      it('should handle decimal calculations', () => {
        expect(calculateBackProfit(12.5, 2.4)).toBe(17.5);
      });
    });

    describe('calculateLayLiability', () => {
      it('should calculate lay bet liability correctly', () => {
        expect(calculateLayLiability(10, 2.0)).toBe(10); // £10 stake at 2.0 = £10 liability
        expect(calculateLayLiability(20, 3.5)).toBe(50); // £20 stake at 3.5 = £50 liability
        expect(calculateLayLiability(5, 1.5)).toBe(2.5); // £5 stake at 1.5 = £2.50 liability
      });
    });

    describe('validateOrderParameters', () => {
      it('should validate correct parameters', () => {
        const result = validateOrderParameters('1.123456', 123456, 2.5, 10);
        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      });

      it('should detect invalid market ID', () => {
        const result = validateOrderParameters('invalid', 123456, 2.5, 10);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Invalid market ID format');
      });

      it('should detect invalid selection ID', () => {
        const result = validateOrderParameters('1.123456', -1, 2.5, 10);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Selection ID must be a positive integer');
      });

      it('should detect invalid price', () => {
        const result = validateOrderParameters('1.123456', 123456, 0.5, 10);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Price must be between 1.01 and 1000');

        const result2 = validateOrderParameters('1.123456', 123456, 1001, 10);
        expect(result2.isValid).toBe(false);
        expect(result2.errors).toContain('Price must be between 1.01 and 1000');
      });

      it('should detect invalid size', () => {
        const result = validateOrderParameters('1.123456', 123456, 2.5, 0.005);
        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Size must be at least 0.01');

        const result2 = validateOrderParameters('1.123456', 123456, 2.5, 100001);
        expect(result2.isValid).toBe(false);
        expect(result2.errors).toContain('Size cannot exceed 100,000');
      });

      it('should detect multiple errors', () => {
        const result = validateOrderParameters('invalid', -1, 0.5, 0.005);
        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(4);
      });
    });

    describe('getComprehensiveMarketResults', () => {
      let authenticatedState: BetfairApiState;

      beforeEach(() => {
        authenticatedState = {
          ...apiState,
          sessionKey: 'test-session',
          appKey: 'test-app-key',
        };
      });

      it('should fetch comprehensive market results', async () => {
        const mockMarketBookResponse = {
          status: 200,
          data: {
            result: [{
              marketId: '1.123456',
              status: 'CLOSED',
              totalMatched: 50000,
              runners: [{
                selectionId: 123,
                status: 'WINNER',
                adjustmentFactor: 1.0,
                totalMatched: 25000,
                sp: { actualSP: 2.5 }
              }, {
                selectionId: 456,
                status: 'LOSER',
                adjustmentFactor: 1.0,
                totalMatched: 15000,
                sp: { actualSP: 3.2 }
              }]
            }]
          }
        };

        const mockMarketCatalogueResponse = {
          status: 200,
          data: {
            result: [{
              marketId: '1.123456',
              marketName: 'Test Race',
              marketStartTime: '2024-01-01T14:00:00Z',
              event: {
                name: 'Test Event',
                venue: 'Test Track'
              },
              runners: [{
                selectionId: 123,
                runnerName: 'Horse A'
              }, {
                selectionId: 456,
                runnerName: 'Horse B'
              }]
            }]
          }
        };

        (axios as any)
          .mockResolvedValueOnce(mockMarketBookResponse)
          .mockResolvedValueOnce(mockMarketCatalogueResponse);

        const result = await getComprehensiveMarketResults(authenticatedState, '1.123456');

        expect(result.data.result).toEqual({
          marketId: '1.123456',
          venue: 'Test Track',
          eventName: 'Test Event',
          marketTime: '2024-01-01T14:00:00Z',
          result: {
            123: { status: 'WINNER' },
            456: { status: 'LOSER' }
          },
          bsp: {
            123: 2.5,
            456: 3.2
          },
          runners: {
            123: { name: 'Horse A', totalMatched: 25000 },
            456: { name: 'Horse B', totalMatched: 15000 }
          },
          settledTime: undefined,
          marketStatus: 'CLOSED',
          totalMatched: 50000
        });

        expect(axios).toHaveBeenCalledTimes(2);
      });

      it('should handle missing market data gracefully', async () => {
        (axios as any).mockResolvedValueOnce({ status: 404, data: { result: [] } });

        await expect(getComprehensiveMarketResults(authenticatedState, '1.123456'))
          .rejects.toThrow('Failed to fetch market book data');
      });
    });
  });
});