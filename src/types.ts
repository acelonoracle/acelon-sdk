export type Protocol = 'Substrate' | 'EVM' | 'WASM' | 'Tezos'
export type AggregationType = 'median' | 'mean' | 'min' | 'max'

export interface AcurastOracleSDKOptions {
  websocketUrls: string[]
  oracles?: string[]
  timeout?: number
}

export interface FetchPricesParams {
  pairs: Array<{
    from: string
    to: string
    price?: number | number[]
  }>
  protocol: Protocol
  exchanges?: string[]
  minSources?: number
  tradeAgeLimit?: number
  aggregation?: AggregationType | AggregationType[]
  maxSourcesDeviation?: number
  maxValidationDiff?: number
}

export interface CheckExchangeHealthParams {
  exchanges?: string[]
}

export interface FetchPricesResult {
  priceInfos: PriceInfo[]
  signedPrices: SignedPrice[]
  version: string
}

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

export interface SignedPrice {
  priceData: {
    from: string
    to: string
    price: number | number[]
    timestamp: number
    sources: Array<{ exchangeId: string; certificate: string }>
    requestHash: string
  }
  packed: string
  signature: string
}

export interface CheckExchangeHealthResult {
  healthStatuses: ExchangeHealthStatus[]
}

export interface ExchangeHealthStatus {
  exchangeId: string
  status: 'up' | 'down'
  responseTime?: number
}
