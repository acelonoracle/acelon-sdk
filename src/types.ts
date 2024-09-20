/**
 * List of supported blockchain protocols.
 */
export type Protocol = "Substrate" | "EVM" | "WASM" | "Tezos"

/**
 * Aggregation types that can be used on the processors.
 */
export type AggregationType = "median" | "mean" | "min" | "max"

/**
 * Configuration options for the AcelonSdk.
 * @property {string[]} [wssUrls] - Array of WebSocket URLs to connect to the Acurast processors.
 * @property {string[]} [oracles] - Array of processor public keys.
 * @property {number} [timeout] - Timeout in milliseconds for the requests.
 * @property {boolean} [logging] - Enable logging of the requests and responses.
 * @property {number} [errorThreshold] - Number of errors from oracles to wait for before throwing it. (Value from 0 to 1 that represents the percentage of ORACLES size)
 */
export interface AcelonSdkOptions {
  wssUrls?: string[]
  oracles?: string[]
  timeout?: number
  logging?: boolean
  errorThreshold?: number
}

/**
 * Pair of symbols to fetch prices for.
 * @property {string} from - From symbol.
 * @property {string} to - To symbol.
 * @property {number} [decimals] - Decimals of the price. Default: 8.
 * @property {number | number[]} [price] - Price(s) to verify against the oracle price. (Provide a price per aggregatyion type requested)
 * @property {number} [timestamp] - Timestamp of the provided prices.
 */
export interface Pair {
  from: string
  to: string
  decimals?: number
  price?: number | number[]
  timestamp?: number
}

/**
 * Parameters for fetching price data.
 * @property {Array<Pair>} pairs - Pairs to fetch prices for.
 * @property {Protocol} protocol - Protocol to package and sign the price data for.
 * @property {string[]} [exchanges] - List of exchange IDs to use as sources on the oracles. Default: all available exchanges.
 * @property {number} [minSources] - Minimum number of sources required. Default: 3.
 * @property {number} [tradeAgeLimit] - Maximum age of trade data in seconds. Default: 5 minutes.
 * @property {AggregationType | AggregationType[]} [aggregation] - Types of price aggregation requested from the oracles. Default: median.
 * @property {number} [maxSourcesDeviation] - Maximum allowed standard deviation between prices in the sources. Default: no limit.
 * @property {number} [maxValidationDiff] - Maximum allowed price difference for validation against client. Default: 0.05%.
 */
export interface FetchPricesParams {
  /**
   * Pairs to fetch prices for.
   * @property {string} from - From symbol.
   * @property {string} to - To symbol.
   * @property {number} [decimals] -  Decimals of the price. Default: 8.
   * @property {number | number[]} [price] - Price(s) to verify against the oracle price. (Provide a price per aggregatyion type requested)
   * @property {number} [timestamp] - Timestamp of the provided prices.
   */
  pairs: Array<Pair>
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
 * @property {number} decimals - Decimals of the price.
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
  decimals: number
  price: Partial<Record<AggregationType, number>>
  validation?: Partial<Record<AggregationType, boolean>>
  timestamp: number
  rawPrices: number[]
  stdDev: number
  sources: Array<{ exchangeId: string; certificate: string }>
}

/**
 * Price data.
 * @property {string} from - From symbol.
 * @property {string} to - To symbol.
 * @property {number} decimals - Decimals of the price.
 * @property {number[]} price - Aggregated price(s).
 * @property {number} timestamp - Timestamp of the price data in ms.
 * @property {Array<{exchangeId: string, certificate: string}>} sources - Map exchangeID to the certificate for sources used.
 * @property {string} requestHash - Hash of the original request parameters.
 */
export interface PriceData {
  from: string
  to: string
  decimals: number
  price: number[]
  timestamp: number
  sources: Array<{ exchangeId: string; certificate: string }>
  requestHash: string
}

/**
 * Signed price data for a single pair.
 * @property {Object} priceData - Price data that was signed.
 * @property {string} packed - Price data in the packed format for the chosen protocol.
 * @property {string} signature - Oracle signatures.
 */
export interface SignedPrice {
  priceData: PriceData
  packed: string
  signature: string
}

/**
 * Result of getting prices, including multiple signatures.
 * @property {Object} priceData - Price data that was signed.
 * @property {string[]} packed - Price data in the packed format for the chosen protocol.
 * @property {string[]} signatures - Oracle signatures.
 * @property {string[]} pubKeys - Oracle public keys.
 */
export interface GetPricesResult {
  priceData: PriceData
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
 * @property {number} [responseTime] - Response time in milliseconds.
 */
export interface ExchangeHealthStatus {
  exchangeId: string
  status: "up" | "down"
  responseTime?: number
}

export type OracleResponse<T> = {
  result: T
  error?: {
    code: number
    message: string
    data?: any
  }
  sender: string
}
