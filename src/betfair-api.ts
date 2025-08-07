import * as querystring from 'querystring';
import axios, { AxiosResponse } from 'axios';

import {
  BetStatus,
  MarketFilter,
  MarketSort,
  OrderProjection,
  PlaceInstruction,
  SortDir,
  Side,
  OrderBy,
  GroupBy,
  TimeRange,
  CurrentOrderSummary,
  ClearedOrderSummary,
  CancelInstruction,
  ReplaceInstruction,
  UpdateInstruction,
  CancelExecutionReport,
  ReplaceExecutionReport,
  UpdateExecutionReport,
  PersistenceType,
  ComprehensiveMarketResults,
  MarketBook,
  RunnerBook,
  MarketProjection,
  PriceData,
} from './betfair-api-types';
import { CurrencyRate, MarketChangeCallback } from './betfair-exchange-stream-api-types';
import { generatePacketId } from './utils';

// Constants
const AUTH_URLS = {
  interactiveLogin: 'https://identitysso.betfair.com.au:443/api/login',
  botLogin: 'https://identitysso-api.betfair.com.au:443/api/certlogin',
  logout: 'https://identitysso.betfair.com.au:443/api/logout',
  keepAlive: 'https://identitysso.betfair.com.au:443/api/keepAlive',
} as const;

const BETTING_URLS = {
  exchange: 'https://api.betfair.com:443/exchange/betting/json-rpc/v1',
} as const;

const ACCOUNT_URLS = {
  accounts: 'https://api.betfair.com/exchange/account/json-rpc/v1',
} as const;

// Types for internal state
export interface BetfairApiState {
  locale: string;
  sessionKey?: string;
  appKey?: string;
  currencyRates?: CurrencyRate[];
  targetCurrency: string;
  conflateMs: number;
  heartbeatMs: number;
  marketChangeCallback: MarketChangeCallback;
}

export interface AuthCredentials {
  sessionKey: string;
  appKey: string;
}

// Core API State Management
export const createBetfairApiState = (
  locale: string,
  currencyCode: string,
  conflateMs: number,
  heartbeatMs: number,
  marketChangeCallback: MarketChangeCallback
): BetfairApiState => ({
  locale,
  targetCurrency: currencyCode,
  conflateMs,
  heartbeatMs,
  marketChangeCallback,
});

// Authentication utilities
export const ensureAuthenticated = (state: BetfairApiState): AuthCredentials => {
  if (!state.sessionKey || !state.appKey) {
    throw new Error('Not authenticated. Call login() first.');
  }
  return { sessionKey: state.sessionKey, appKey: state.appKey };
};

export const isAuthenticated = (state: BetfairApiState): boolean => {
  return !!(state.sessionKey && state.appKey);
};

// HTTP Request utilities
const performLogin = async (
  appKey: string,
  username: string,
  password: string
): Promise<AxiosResponse> => {
  const formData = querystring.stringify({
    username,
    password,
    login: true,
    redirectMethod: 'POST',
    product: 'home.betfair.int',
    url: 'https://www.betfair.com/',
  });

  return axios({
    method: 'post',
    url: AUTH_URLS.interactiveLogin,
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': formData.length,
      'x-application': appKey,
    },
    data: formData,
  });
};

const makeRequest = async (
  url: string,
  data: string,
  sessionKey: string,
  appKey: string
): Promise<AxiosResponse> => {
  return axios({
    method: 'post',
    url,
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'content-length': data.length,
      'x-authentication': sessionKey,
      'x-application': appKey,
    },
    data,
  });
};

const makeBettingApiRequest = async (
  method: string,
  params: any,
  sessionKey: string,
  appKey: string
): Promise<AxiosResponse> => {
  const requestPayload = {
    jsonrpc: '2.0',
    method: `SportsAPING/v1.0/${method}`,
    params,
    id: generatePacketId(),
  };

  return makeRequest(
    BETTING_URLS.exchange,
    JSON.stringify(requestPayload),
    sessionKey,
    appKey
  );
};

const makeAccountApiRequest = async (
  method: string,
  params: any,
  sessionKey: string,
  appKey: string
): Promise<AxiosResponse> => {
  const requestPayload = {
    jsonrpc: '2.0',
    method: `AccountAPING/v1.0/${method}`,
    params,
    id: generatePacketId(),
  };

  return makeRequest(
    ACCOUNT_URLS.accounts,
    JSON.stringify(requestPayload),
    sessionKey,
    appKey
  );
};

// Core Authentication Functions
export const login = async (
  state: BetfairApiState,
  appKey: string,
  username: string,
  password: string
): Promise<BetfairApiState> => {
  try {
    const authResponse = await performLogin(appKey, username, password);
    
    if (authResponse.data.status !== 'SUCCESS') {
      throw new Error('Login failed!');
    }

    const updatedState: BetfairApiState = {
      ...state,
      appKey,
      sessionKey: authResponse.data.token,
    };

    const currencyResponse = await listCurrencyRates(updatedState, 'GBP');
    if (currencyResponse.status !== 200) {
      throw new Error('Error listing currency rates');
    }

    return {
      ...updatedState,
      currencyRates: currencyResponse.data.result,
    };
  } catch (error) {
    throw new Error(`Login failed: ${error}`);
  }
};

export const logout = async (sessionKey: string): Promise<AxiosResponse> => {
  const formData = querystring.stringify({
    product: 'home.betfair.int',
    url: 'https://www.betfair.com/',
  });

  return axios({
    method: 'post',
    url: AUTH_URLS.logout,
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': formData.length,
      'x-authentication': sessionKey,
    },
    data: formData,
  });
};

export const keepAlive = async (sessionKey: string): Promise<AxiosResponse> => {
  const formData = querystring.stringify({
    product: 'home.betfair.int',
    url: 'https://www.betfair.com/',
  });

  return axios({
    method: 'post',
    url: AUTH_URLS.keepAlive,
    headers: {
      accept: 'application/json',
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': formData.length,
      'x-authentication': sessionKey,
    },
    data: formData,
  });
};

// Market Data Functions
export const listMarketCatalogue = async (
  state: BetfairApiState,
  filter: MarketFilter,
  marketProjection: any[],
  sort: MarketSort,
  maxResults: number
): Promise<AxiosResponse> => {
  const { sessionKey, appKey } = ensureAuthenticated(state);

  return makeBettingApiRequest(
    'listMarketCatalogue',
    {
      filter,
      marketProjection,
      sort,
      maxResults,
      locale: state.locale,
    },
    sessionKey,
    appKey
  );
};

export const listMarketBook = async (
  state: BetfairApiState,
  params: any
): Promise<AxiosResponse> => {
  const { sessionKey, appKey } = ensureAuthenticated(state);
  return makeBettingApiRequest('listMarketBook', params, sessionKey, appKey);
};

const makeDevApiRequest = async (
  state: BetfairApiState,
  method: string,
  filter: MarketFilter
): Promise<AxiosResponse> => {
  const { sessionKey, appKey } = ensureAuthenticated(state);
  return makeBettingApiRequest(
    method,
    {
      filter,
      locale: state.locale,
    },
    sessionKey,
    appKey
  );
};

export const listEventTypes = async (
  state: BetfairApiState,
  filter: MarketFilter
): Promise<AxiosResponse> => {
  return makeDevApiRequest(state, 'listEventTypes', filter);
};

export const listCompetitions = async (
  state: BetfairApiState,
  filter: MarketFilter
): Promise<AxiosResponse> => {
  return makeDevApiRequest(state, 'listCompetitions', filter);
};

export const listTimeRanges = async (
  state: BetfairApiState,
  filter: MarketFilter
): Promise<AxiosResponse> => {
  return makeDevApiRequest(state, 'listTimeRanges', filter);
};

export const listEvents = async (
  state: BetfairApiState,
  filter: MarketFilter
): Promise<AxiosResponse> => {
  return makeDevApiRequest(state, 'listEvents', filter);
};

export const listMarketTypes = async (
  state: BetfairApiState,
  filter: MarketFilter
): Promise<AxiosResponse> => {
  return makeDevApiRequest(state, 'listMarketTypes', filter);
};

export const listCountries = async (
  state: BetfairApiState,
  filter: MarketFilter
): Promise<AxiosResponse> => {
  return makeDevApiRequest(state, 'listCountries', filter);
};

export const listVenues = async (
  state: BetfairApiState,
  filter: MarketFilter
): Promise<AxiosResponse> => {
  return makeDevApiRequest(state, 'listVenues', filter);
};

export const listMarketProfitAndLoss = async (
  state: BetfairApiState,
  marketIds: string[],
  includeSettledBets: boolean,
  includeBspBets: boolean,
  netOfCommission: boolean
): Promise<AxiosResponse> => {
  const { sessionKey, appKey } = ensureAuthenticated(state);

  return makeBettingApiRequest(
    'listMarketProfitAndLoss',
    {
      marketIds,
      includeSettledBets,
      includeBspBets,
      netOfCommission,
      locale: state.locale,
    },
    sessionKey,
    appKey
  );
};

// Betting Functions
export const placeOrders = async (
  state: BetfairApiState,
  marketId: string,
  instructions: PlaceInstruction[],
  customerRef: string,
  marketVersion: number,
  customerStrategyRef: string,
  async: boolean
): Promise<AxiosResponse> => {
  const { sessionKey, appKey } = ensureAuthenticated(state);

  // Build params object with only non-empty values
  const params: any = {
    marketId,
    instructions,
  };

  if (customerRef) {
    params.customerRef = customerRef;
  }

  if (marketVersion) {
    params.marketVersion = marketVersion;
  }

  if (customerStrategyRef) {
    params.customerStrategyRef = customerStrategyRef;
  }

  // Only add async if it's true (Betfair might not expect false)
  if (async) {
    params.async = async;
  }

  return makeBettingApiRequest(
    'placeOrders',
    params,
    sessionKey,
    appKey
  );
};

// Account Functions
export const listCurrencyRates = async (
  state: BetfairApiState,
  fromCurrency: string
): Promise<AxiosResponse> => {
  const { sessionKey, appKey } = ensureAuthenticated(state);

  return makeAccountApiRequest(
    'listCurrencyRates',
    { fromCurrency },
    sessionKey,
    appKey
  );
};

// Utility Functions
export const findCurrencyRate = (
  currencyRates: CurrencyRate[],
  currencyCode: string
): CurrencyRate | undefined => {
  return currencyRates.find(rate => rate.currencyCode === currencyCode);
};

/**
 * Standardizes location names for Betfair API consistency
 * @param location - The location string to standardize
 * @returns Standardized location string
 */
export const betfairStandardizeLocation = (location: string): string => {
  // Basic location standardization - can be extended with more rules
  const standardizedLocation = location
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return standardizedLocation;
};

/**
 * Lists current orders for the authenticated account
 * @param state - Current API state
 * @param betIds - Optional list of bet IDs to filter by
 * @param marketIds - Optional list of market IDs to filter by
 * @param orderProjection - What order data to include in the response
 * @param placedDateRange - Optional date range for when orders were placed
 * @param orderBy - How to order the results
 * @param sortDir - Sort direction (earliest to latest or latest to earliest)
 * @param fromRecord - Record index to start from (for pagination)
 * @param recordCount - Number of records to return
 * @returns Promise with current orders response
 */
export const listCurrentOrders = async (
  state: BetfairApiState,
  betIds?: string[],
  marketIds?: string[],
  orderProjection: OrderProjection = OrderProjection.ALL,
  placedDateRange?: TimeRange,
  orderBy?: OrderBy,
  sortDir?: SortDir,
  fromRecord?: number,
  recordCount?: number
): Promise<AxiosResponse<{ result: CurrentOrderSummary[] }>> => {
  const { sessionKey, appKey } = ensureAuthenticated(state);

  const params: any = {
    orderProjection,
    locale: state.locale,
  };

  if (betIds && betIds.length > 0) {
    params.betIds = betIds;
  }

  if (marketIds && marketIds.length > 0) {
    params.marketIds = marketIds;
  }

  if (placedDateRange) {
    params.placedDateRange = placedDateRange;
  }

  if (orderBy) {
    params.orderBy = orderBy;
  }

  if (sortDir) {
    params.sortDir = sortDir;
  }

  if (fromRecord !== undefined) {
    params.fromRecord = fromRecord;
  }

  if (recordCount !== undefined) {
    params.recordCount = recordCount;
  }

  return makeBettingApiRequest('listCurrentOrders', params, sessionKey, appKey);
};

/**
 * Lists cleared (settled) orders for the authenticated account
 * @param state - Current API state
 * @param betStatus - Status of the bet (e.g., SETTLED, VOIDED, LAPSED, CANCELLED)
 * @param eventTypeIds - Optional list of event type IDs to filter by
 * @param eventIds - Optional list of event IDs to filter by
 * @param marketIds - Optional list of market IDs to filter by
 * @param runnerIds - Optional list of runner selection IDs to filter by
 * @param betIds - Optional list of bet IDs to filter by
 * @param side - Optional side filter (BACK or LAY)
 * @param settledDateRange - Optional date range for when bets were settled
 * @param groupBy - How to group the results
 * @param includeItemDescription - Whether to include item descriptions
 * @param fromRecord - Record index to start from (for pagination)
 * @param recordCount - Number of records to return
 * @returns Promise with cleared orders response
 */
export const listClearedOrders = async (
  state: BetfairApiState,
  betStatus: BetStatus = BetStatus.SETTLED,
  eventTypeIds?: string[],
  eventIds?: string[],
  marketIds?: string[],
  runnerIds?: number[],
  betIds?: string[],
  side?: Side,
  settledDateRange?: TimeRange,
  groupBy?: GroupBy,
  includeItemDescription?: boolean,
  fromRecord?: number,
  recordCount?: number
): Promise<AxiosResponse<{ result: ClearedOrderSummary[] }>> => {
  const { sessionKey, appKey } = ensureAuthenticated(state);

  const params: any = {
    betStatus,
    locale: state.locale,
  };

  if (eventTypeIds && eventTypeIds.length > 0) {
    params.eventTypeIds = eventTypeIds;
  }

  if (eventIds && eventIds.length > 0) {
    params.eventIds = eventIds;
  }

  if (marketIds && marketIds.length > 0) {
    params.marketIds = marketIds;
  }

  if (runnerIds && runnerIds.length > 0) {
    params.runnerIds = runnerIds;
  }

  if (betIds && betIds.length > 0) {
    params.betIds = betIds;
  }

  if (side) {
    params.side = side;
  }

  if (settledDateRange) {
    params.settledDateRange = settledDateRange;
  }

  if (groupBy) {
    params.groupBy = groupBy;
  }

  if (includeItemDescription !== undefined) {
    params.includeItemDescription = includeItemDescription;
  }

  if (fromRecord !== undefined) {
    params.fromRecord = fromRecord;
  }

  if (recordCount !== undefined) {
    params.recordCount = recordCount;
  }

  return makeBettingApiRequest('listClearedOrders', params, sessionKey, appKey);
};

/**
 * Cancels orders on the exchange
 * @param state - Current API state
 * @param marketId - The market ID where the orders are placed
 * @param instructions - Array of cancel instructions
 * @param customerRef - Optional customer reference for the transaction
 * @returns Promise with cancel execution report
 */
export const cancelOrders = async (
  state: BetfairApiState,
  marketId: string,
  instructions: CancelInstruction[],
  customerRef?: string
): Promise<AxiosResponse<{ result: CancelExecutionReport }>> => {
  const { sessionKey, appKey } = ensureAuthenticated(state);

  if (!instructions || instructions.length === 0) {
    throw new Error('Cancel instructions are required');
  }

  if (instructions.length > 60) {
    throw new Error('Maximum 60 cancel instructions allowed per request');
  }

  const params: any = {
    marketId,
    instructions,
    locale: state.locale,
  };

  if (customerRef) {
    params.customerRef = customerRef;
  }

  return makeBettingApiRequest('cancelOrders', params, sessionKey, appKey);
};

/**
 * Replaces orders on the exchange
 * @param state - Current API state
 * @param marketId - The market ID where the orders are placed
 * @param instructions - Array of replace instructions
 * @param customerRef - Optional customer reference for the transaction
 * @param marketVersion - Market version (optional but recommended)
 * @param async - Whether to process asynchronously
 * @returns Promise with replace execution report
 */
export const replaceOrders = async (
  state: BetfairApiState,
  marketId: string,
  instructions: ReplaceInstruction[],
  customerRef?: string,
  marketVersion?: number,
  async?: boolean
): Promise<AxiosResponse<{ result: ReplaceExecutionReport }>> => {
  const { sessionKey, appKey } = ensureAuthenticated(state);

  if (!instructions || instructions.length === 0) {
    throw new Error('Replace instructions are required');
  }

  if (instructions.length > 60) {
    throw new Error('Maximum 60 replace instructions allowed per request');
  }

  const params: any = {
    marketId,
    instructions,
    locale: state.locale,
  };

  if (customerRef) {
    params.customerRef = customerRef;
  }

  if (marketVersion !== undefined) {
    params.marketVersion = marketVersion;
  }

  if (async !== undefined) {
    params.async = async;
  }

  return makeBettingApiRequest('replaceOrders', params, sessionKey, appKey);
};

/**
 * Updates orders on the exchange
 * @param state - Current API state
 * @param marketId - The market ID where the orders are placed
 * @param instructions - Array of update instructions
 * @param customerRef - Optional customer reference for the transaction
 * @returns Promise with update execution report
 */
export const updateOrders = async (
  state: BetfairApiState,
  marketId: string,
  instructions: UpdateInstruction[],
  customerRef?: string
): Promise<AxiosResponse<{ result: UpdateExecutionReport }>> => {
  const { sessionKey, appKey } = ensureAuthenticated(state);

  if (!instructions || instructions.length === 0) {
    throw new Error('Update instructions are required');
  }

  if (instructions.length > 60) {
    throw new Error('Maximum 60 update instructions allowed per request');
  }

  const params: any = {
    marketId,
    instructions,
    locale: state.locale,
  };

  if (customerRef) {
    params.customerRef = customerRef;
  }

  return makeBettingApiRequest('updateOrders', params, sessionKey, appKey);
};

// Additional utility functions for order management

/**
 * Creates a cancel instruction for a specific bet
 * @param betId - The bet ID to cancel
 * @param sizeReduction - Optional size reduction instead of full cancellation
 * @returns Cancel instruction
 */
export const createCancelInstruction = (
  betId: string,
  sizeReduction?: number
): CancelInstruction => ({
  betId,
  ...(sizeReduction !== undefined && { sizeReduction }),
});

/**
 * Creates a replace instruction for a specific bet
 * @param betId - The bet ID to replace
 * @param newPrice - The new price for the bet
 * @returns Replace instruction
 */
export const createReplaceInstruction = (
  betId: string,
  newPrice: number
): ReplaceInstruction => ({
  betId,
  newPrice,
});

/**
 * Creates an update instruction for a specific bet
 * @param betId - The bet ID to update
 * @param newPersistenceType - The new persistence type
 * @returns Update instruction
 */
export const createUpdateInstruction = (
  betId: string,
  newPersistenceType: PersistenceType
): UpdateInstruction => ({
  betId,
  newPersistenceType,
});

/**
 * Validates if a bet ID is in correct format
 * @param betId - The bet ID to validate
 * @returns True if valid, false otherwise
 */
export const isValidBetId = (betId: string): boolean => {
  // Bet IDs are typically numeric strings
  return /^\d+$/.test(betId);
};

/**
 * Calculates potential profit for a back bet
 * @param stake - The stake amount
 * @param odds - The odds
 * @returns Potential profit
 */
export const calculateBackProfit = (stake: number, odds: number): number => {
  return stake * (odds - 1);
};

/**
 * Calculates liability for a lay bet
 * @param stake - The stake amount (what you'll win)
 * @param odds - The odds
 * @returns Liability (what you'll lose if the bet wins)
 */
export const calculateLayLiability = (stake: number, odds: number): number => {
  return stake * (odds - 1);
};

/**
 * Validates order parameters for common issues
 * @param marketId - Market ID
 * @param selectionId - Selection ID
 * @param price - Odds price
 * @param size - Bet size
 * @returns Object with validation result and any error messages
 */
export const validateOrderParameters = (
  marketId: string,
  selectionId: number,
  price: number,
  size: number
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  if (!marketId || !marketId.match(/^1\.\d+$/)) {
    errors.push('Invalid market ID format');
  }

  if (!Number.isInteger(selectionId) || selectionId <= 0) {
    errors.push('Selection ID must be a positive integer');
  }

  if (price < 1.01 || price > 1000) {
    errors.push('Price must be between 1.01 and 1000');
  }

  if (size < 0.01) {
    errors.push('Size must be at least 0.01');
  }

  if (size > 100000) {
    errors.push('Size cannot exceed 100,000');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Gets comprehensive market settlement results including runner names and volume data
 * @param state - Current API state
 * @param marketId - The market ID to get results for
 * @returns Promise with comprehensive market results
 */
export const getComprehensiveMarketResults = async (
  state: BetfairApiState,
  marketId: string
): Promise<AxiosResponse<{ result: ComprehensiveMarketResults }>> => {
  const { sessionKey, appKey } = ensureAuthenticated(state);

  // Get market book data for BSP and settlement status
  const marketBookResponse = await makeBettingApiRequest(
    'listMarketBook',
    {
      marketIds: [marketId],
      priceProjection: {
        priceData: [PriceData.SP_AVAILABLE, PriceData.SP_TRADED, PriceData.EX_TRADED],
      },
      orderProjection: 'ALL',
      matchProjection: 'ROLLED_UP_BY_PRICE',
    },
    sessionKey,
    appKey
  );

  if (marketBookResponse.status !== 200 || !marketBookResponse.data.result?.[0]) {
    throw new Error('Failed to fetch market book data');
  }

  const marketBook: MarketBook = marketBookResponse.data.result[0];

  // Get market catalogue data for runner names and event details
  const marketCatalogueResponse = await makeBettingApiRequest(
    'listMarketCatalogue',
    {
      filter: { marketIds: [marketId] },
      marketProjection: [
        MarketProjection.RUNNER_DESCRIPTION,
        MarketProjection.EVENT,
        MarketProjection.MARKET_START_TIME,
        MarketProjection.MARKET_DESCRIPTION,
      ],
      maxResults: 1,
      locale: state.locale,
    },
    sessionKey,
    appKey
  );

  if (marketCatalogueResponse.status !== 200 || !marketCatalogueResponse.data.result?.[0]) {
    throw new Error('Failed to fetch market catalogue data');
  }

  const marketCatalogue = marketCatalogueResponse.data.result[0];

  // Build comprehensive results
  const result: { [selectionId: number]: { status: 'WINNER' | 'LOSER' | 'REMOVED' | 'VOID'; adjustmentFactor?: number } } = {};
  const bsp: { [selectionId: number]: number } = {};
  const runners: { [selectionId: number]: { name: string; totalMatched: number } } = {};

  // Process runners from market book
  marketBook.runners.forEach((runner: RunnerBook) => {
    // Map runner status to result status
    let status: 'WINNER' | 'LOSER' | 'REMOVED' | 'VOID';
    switch (runner.status) {
      case 'WINNER':
        status = 'WINNER';
        break;
      case 'LOSER':
        status = 'LOSER';
        break;
      case 'REMOVED_VACANT':
      case 'REMOVED':
        status = 'REMOVED';
        break;
      case 'HIDDEN':
        status = 'VOID';
        break;
      default:
        status = 'LOSER'; // Default for active runners in settled markets
    }

    result[runner.selectionId] = {
      status,
      ...(runner.adjustmentFactor !== 1.0 && { adjustmentFactor: runner.adjustmentFactor }),
    };

    // BSP data
    bsp[runner.selectionId] = runner.sp?.actualSP || 0;

    // Find runner name from catalogue
    const catalogueRunner = marketCatalogue.runners?.find((r: any) => r.selectionId === runner.selectionId);
    runners[runner.selectionId] = {
      name: catalogueRunner?.runnerName || `Selection ${runner.selectionId}`,
      totalMatched: runner.totalMatched || 0,
    };
  });

  const comprehensiveResults: ComprehensiveMarketResults = {
    marketId: marketBook.marketId,
    venue: marketCatalogue.event?.venue || 'Unknown',
    eventName: marketCatalogue.event?.name || marketCatalogue.marketName || 'Unknown Event',
    marketTime: marketCatalogue.marketStartTime || marketCatalogue.description?.marketTime || '',
    result,
    bsp,
    runners,
    settledTime: marketCatalogue.description?.settleTime || undefined,
    marketStatus: marketBook.status,
    totalMatched: marketBook.totalMatched || 0,
  };

  return {
    ...marketBookResponse,
    data: { result: comprehensiveResults },
  };
};