/**
 * List of supported blockchain protocols.
 */
export type Protocol = "Substrate" | "EVM" | "WASM" | "Tezos"

/**
 * Aggregation types that can be used on the processors.
 */
export type AggregationType = "median" | "mean" | "min" | "max"

/**
 * Configuration options for the AcurastOracleSDK.
 * @property {string[]} websocketUrls - Array of WebSocket URLs to connect to the Acurast processors.
 * @property {string[]} [oracles] - Array of processor public keys.
 * @property {number} [timeout] - Timeout in milliseconds for the requests.
 */
export interface AcurastOracleSDKOptions {
  websocketUrls: string[]
  oracles?: string[]
  timeout?: number,
  logging?: boolean
}

/**
 * Parameters for fetching price data.
 * @property {Array<{from: string, to: string, price?: number | number[], timestamp?: number}>} pairs - Pairs to fetch prices for.
 * @property {Protocol} protocol - Protocol to package the price data for.
 * @property {string[]} [exchanges] - List of exchange IDs to use as sources on the oracles. Default: all available exchanges.
 * @property {number} [minSources] - Minimum number of sources required. Default: 3.
 * @property {number} [tradeAgeLimit] - Maximum age of trade data in seconds. Default: 5 minutes.
 * @property {AggregationType | AggregationType[]} [aggregation] - Types of price aggregation requested from the oracles. Default: mean.
 * @property {number} [maxSourcesDeviation] - Maximum allowed standard deviation between prices in the sources. Default: no limit.
 * @property {number} [maxValidationDiff] - Maximum allowed price difference for validation against client. Default: 0.05%.
 */
export interface FetchPricesParams {
  /**
   * Pairs to fetch prices for.
   * @property {string} from - From symbol.
   * @property {string} to - To symbol.
   * @property {number | number[]} [price] - Price(s) to verify against the oracle price. (Provide a price per aggregatyion type requested)
   * @property {number} [timestamp] - Timestamp of the provided prices.
   */
  pairs: Array<{
    from: string
    to: string
    price?: number | number[]
    timestamp?: number
  }>
  protocol: Protocol
  exchanges?: string[]
  minSources?: number
  tradeAgeLimit?: number
  aggregation?: AggregationType | AggregationType[]
  maxSourcesDeviation?: number
  maxValidationDiff?: number
}

/**
 * Parameters for checking exchange health.
 * @property {string[]} [exchanges] - List of exchange IDs to check. Default: all available exchanges.
 */
export interface CheckExchangeHealthParams {
  exchanges?: string[]
}

/**
 * Result of fetching prices.
 * @property {PriceInfo[]} priceInfos - Detailed price information for each requested pair.
 * @property {SignedPrice[]} signedPrices - Signed price data for each requested pair.
 * @property {string} version - Version of the oracle service.
 */
export interface FetchPricesResult {
  priceInfos: PriceInfo[]
  signedPrices: SignedPrice[]
  version: string
}

/**
 * Detailed price information for a single pair.
 * @property {string} from - From symbol.
 * @property {string} to - To symbol.
 * @property {Partial<Record<AggregationType, number>>} price - Aggregated prices for each requested aggregation type.
 * @property {Partial<Record<AggregationType, boolean>>} [validation] - Validation results for each aggregation type, if applicable.
 * @property {number} timestamp - Timestamp of the price data.
 * @property {number[]} rawPrices - Array of raw prices from all sources.
 * @property {number} stdDev - Standard deviation of the raw prices.
 * @property {Array<{exchangeId: string, certificate: string}>} sources - Information about the sources used for this price data.
 */
export interface PriceInfo {
  from: string
  to: string
  price: Partial<Record<AggregationType, number>>
  validation?: Partial<Record<AggregationType, boolean>>
  timestamp: number
  rawPrices: number[]
  stdDev: number
  sources: Array<{ exchangeId: string; certificate: string }>
}

/**
 * Signed price data for a single pair.
 * @property {Object} priceData - Price data that was signed.
 * @property {string} packed - Packed representation of the price data.
 * @property {string} signature - Signature of the packed price data.
 */
export interface SignedPrice {
  priceData: {
    /** @property {string} from - From symbol. */
    from: string
    /** @property {string} to - To symbol. */
    to: string
    /** @property {number | number[]} price - Aggregated price(s). */
    price: number | number[]
    /** @property {number} timestamp - Timestamp of the price data. */
    timestamp: number
    /** @property {Array<{exchangeId: string, certificate: string}>} sources - Information about the sources used for this price data. */
    sources: Array<{ exchangeId: string; certificate: string }>
    /** @property {string} requestHash - Hash of the original request parameters. */
    requestHash: string
  }
  packed: string
  signature: string
}

/**
 * Result of getting prices, including multiple signatures.
 * @property {Object} priceData - Price data that was signed.
 * @property {string[]} packed - Array of packed representations of the price data.
 * @property {string[]} signatures - Array of signatures corresponding to the packed price data.
 * @property {string[]} pubKeys - Array of public keys corresponding to the signatures.
 */
export interface GetPricesResult {
  priceData: {
    /** @property {string} from - From symbol. */
    from: string
    /** @property {string} to - To symbol. */
    to: string
    /** @property {number | number[]} price - Aggregated price(s). */
    price: number | number[]
    /** @property {number} timestamp - Timestamp of the price data. */
    timestamp: number
    /** @property {Array<{exchangeId: string, certificate: string}>} sources - Information about the sources used for this price data. */
    sources: Array<{ exchangeId: string; certificate: string }>
    /** @property {string} requestHash - Hash of the original request parameters. */
    requestHash: string
  }
  packed: string[]
  signatures: string[]
  pubKeys: string[]
}

/**
 * Result of checking exchange health.
 * @property {ExchangeHealthStatus[]} healthStatuses - Health status for each checked exchange.
 */
export interface CheckExchangeHealthResult {
  healthStatuses: ExchangeHealthStatus[]
}

/**
 * Health status of a single exchange.
 * @property {string} exchangeId - ID of the exchange.
 * @property {"up" | "down"} status - Current status of the exchange.
 * @property {number} [responseTime] - Response time in milliseconds, if available.
 */
export interface ExchangeHealthStatus {
  exchangeId: string
  status: "up" | "down"
  responseTime?: number
}
