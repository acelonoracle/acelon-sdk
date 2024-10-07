import { AcurastClient } from '@acurast/dapp'
import { ec } from 'elliptic'
import { Buffer } from 'buffer'
import { v4 as uuidv4 } from 'uuid'
import {
  AcelonSdkOptions,
  CheckExchangeHealthResult,
  CheckExchangeHealthParams,
  FetchPricesParams,
  FetchPricesResult,
  PriceInfo,
  GetPricesResult,
  OracleResponse,
  AggregationType,
  Protocol,
} from './types'

/**
 * AcelonSdk provides methods to interact with the Acurast Oracle network.
 */
export class AcelonSdk {
  private client!: AcurastClient
  private keyPair: { privateKey: string; publicKey: string }
  private pendingRequests: Map<
    string,
    {
      resolve: Function
      reject: Function
      timer: NodeJS.Timeout
      responses: Map<string, any>
      errorResponses: Map<string, any>
      errorCounts: Map<number, number>
      requiredResponses: number
    }
  > = new Map()
  private initPromise: Promise<void>
  private oracles: string[] = []
  private wssUrls: string[] = []
  private timeout: number
  private logging: boolean
  private errorThreshold: number

  private idToPubKeyMap: Record<string, string> = {}

  /**
   * Creates an instance of AcelonSdk.
   * @param {AcelonSdkOptions} options - The configuration options.
   */
  constructor(options: AcelonSdkOptions) {
    this.keyPair = this.generateKeyPair()
    this.timeout = options.timeout || 20 * 1000 // Default 20 seconds timeout
    this.logging = options.logging || false
    this.errorThreshold = options.errorThreshold || 3

    this.initPromise = this.init(options)
  }

  private async init(options: AcelonSdkOptions): Promise<void> {
    let defaultSettings: { wssUrls: string[]; oracles: string[] } = {
      wssUrls: [],
      oracles: [],
    }
    if (
      !options.wssUrls ||
      !options.oracles ||
      options.wssUrls.length === 0 ||
      options.oracles.length === 0
    ) {
      this.log('🔍 Fetching default settings ...')
      defaultSettings = await this.fetchDefaultSettings()
      this.log(`Fetched default settings: ${JSON.stringify(defaultSettings)}`)
    }

    if (options.oracles && options.oracles.length > 0) {
      this.log(`Using provided oracles : ${options.oracles}`)
      this.oracles = options.oracles
    } else if (defaultSettings.oracles.length > 0) {
      this.log('Using default oracles ...')
      this.oracles = defaultSettings.oracles
    } else {
      throw new Error('No oracles provided')
    }

    if (options.wssUrls && options.wssUrls.length > 0) {
      this.log(`Using provided wssUrls : ${options.wssUrls}`)
      this.wssUrls = options.wssUrls
    } else if (defaultSettings.wssUrls.length > 0) {
      this.log('Using default wssUrls ...')
      this.wssUrls = defaultSettings.wssUrls
    } else {
      throw new Error('No wssUrls provided')
    }

    this.log('🛜 Opening websocket connection ...')
    try {
      this.client = new AcurastClient(this.wssUrls)

      await this.client.start({
        secretKey: this.keyPair.privateKey,
        publicKey: this.keyPair.publicKey,
      })
      this.log('✅ Connection opened')

      // map oracle public keys to their ids
      this.idToPubKeyMap = {}
      this.oracles.map((oracle) => {
        const id = this.client.idFromPublicKey(oracle)
        this.idToPubKeyMap[id] = oracle
      })

      this.client.onMessage(this.handleMessage.bind(this))
    } catch (error) {
      this.log(`❌ Failed to open connection:, ${error}`)
      throw error
    }
  }

  private async fetchDefaultSettings(): Promise<{
    wssUrls: string[]
    oracles: string[]
  }> {
    try {
      const response = await fetch(
        'https://acurast-oracle-service.storage.googleapis.com/sdk_settings.json'
      )
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const settings = await response.json()
      return settings
    } catch (error) {
      this.log(`Failed to fetch default settings: ${error}`, 'error')
      return { wssUrls: [], oracles: [] }
    }
  }

  private generateKeyPair() {
    const EC = new ec('p256')
    const keyPair = EC.genKeyPair()
    return {
      privateKey: keyPair.getPrivate('hex'),
      publicKey: keyPair.getPublic(true, 'hex'),
    }
  }
  private handleMessage(message: any) {
    try {
      const payload = JSON.parse(Buffer.from(message.payload, 'hex').toString())
      const sender = Buffer.from(message.sender).toString('hex')
      this.log(`📦 Received payload from ${sender}`)

      // Requests are divided by ID. Each call to sendRequestToOracles creates a new ID, so we can
      // track the responses for each request separately
      const pendingRequest = this.pendingRequests.get(payload.id)
      if (pendingRequest) {
        if (payload.error) {
          this.log(
            `❌ Received error from ${sender}: ${JSON.stringify(
              payload.error
            )}`,
            'error'
          )
          pendingRequest.errorResponses.set(sender, {
            error: payload.error,
            sender,
          })

          // Increment the count for this specific error code
          const errorCode = payload.error.code
          const currentCount =
            (pendingRequest.errorCounts.get(errorCode) || 0) + 1
          pendingRequest.errorCounts.set(errorCode, currentCount)

          // Check if this error type has reached the threshold
          if (currentCount >= this.errorThreshold) {
            clearTimeout(pendingRequest.timer)
            this.pendingRequests.delete(payload.id)
            pendingRequest.reject(
              new Error(
                `${errorCode}: ${payload.error.message} : ${payload.error.data}`
              )
            )
            return
          }
        } else {
          pendingRequest.responses.set(sender, {
            result: payload.result,
            sender,
          })
        }

        // If we've received enough responses, resolve the promise
        if (pendingRequest.responses.size >= pendingRequest.requiredResponses) {
          clearTimeout(pendingRequest.timer)
          this.pendingRequests.delete(payload.id)
          pendingRequest.resolve(Array.from(pendingRequest.responses.values()))
        }
      } else {
        // If we receive a response for a request we're not tracking, ignore it
        //this.log(`🥱 Received response for untracked request ... ignoring ${payload}`, "warn")
      }
    } catch (error) {
      this.log(`❌ Error parsing message: ${error}`, 'error')
    }
  }

  // Sends a request to multiple oracles and waits for responses
  // Returns a promise that resolves when enough responses are received - or rejects on timeout
  private async sendRequestToOracles<T>(
    method: string,
    params: FetchPricesParams | CheckExchangeHealthParams,
    requiredResponses: number = 0,
    enableTimeoutError: boolean = true
  ): Promise<OracleResponse<T>[]> {
    await this.initPromise

    return new Promise((resolve, reject) => {
      const requestId = uuidv4()
      const responses = new Map<string, OracleResponse<T>>()
      const errorResponses = new Map<string, OracleResponse<T>>()
      const errorCounts = new Map<number, number>()

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          if (enableTimeoutError) {
            this.pendingRequests.delete(requestId)
            reject(new Error(`Request timed out after ${this.timeout}ms`))
          } else {
            const collectedResponses = Array.from(responses.values())
            this.pendingRequests.delete(requestId)
            resolve(collectedResponses)
          }
        }
      }, this.timeout)

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timer,
        responses,
        errorResponses,
        errorCounts,
        requiredResponses,
      })

      this.oracles.forEach((oracle) => {
        this.sendRequest(method, params, oracle, requestId).catch((error) => {
          this.log(
            `❌ Failed to send request to oracle ${oracle}: ${error}`,
            'error'
          )
        })
      })
    })
  }

  private async sendRequest(
    method: string,
    params: FetchPricesParams | CheckExchangeHealthParams,
    oracle: string,
    requestId: string
  ): Promise<void> {
    const request = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    }

    const message = JSON.stringify(request)
    this.log(`📤 Sending ${method} request to oracle ${oracle}: ${message}`)

    await this.client.send(oracle, message)
  }

  // Check if all prices in a response are valid
  private isValidResponse(priceInfo: PriceInfo): boolean {
    if (!priceInfo.validation) return false
    return Object.values(priceInfo.validation).every((value) => value === true)
  }

  private validateFetchPricesParams(params: FetchPricesParams): void {
    // Check if pairs is present and has at least one pair
    if (!params.pairs || params.pairs.length === 0) {
      throw new Error('Pairs array must contain at least one pair')
    }

    // Check each pair
    params.pairs.forEach((pair, index) => {
      if (!pair.from || !pair.to) {
        throw new Error(
          `Pair at index ${index} must have 'from' and 'to' fields`
        )
      }

      if (pair.decimals && (pair.decimals < 0 || pair.decimals > 18)) {
        throw new Error('Decimals must be between 0 and 18')
      }
    })

    // Check if protocol is present
    if (!params.protocol) {
      throw new Error('Protocol field is required')
    }

    // Check if protocol is valid
    const validProtocols: Protocol[] = [
      'Substrate',
      'EVM',
      'WASM',
      'Tezos',
      'Youves',
    ]
    if (!validProtocols.includes(params.protocol)) {
      throw new Error(`Invalid protocol: ${params.protocol}`)
    }

    // Check minSources against exchanges length
    if (
      params.exchanges &&
      params.minSources &&
      params.minSources > params.exchanges.length
    ) {
      throw new Error(
        `minSources (${params.minSources}) cannot be greater than the number of exchanges (${params.exchanges.length})`
      )
    }

    // Check tradeAgeLimit
    if (params.tradeAgeLimit !== undefined && params.tradeAgeLimit <= 0) {
      throw new Error('tradeAgeLimit must be positive')
    }

    // Check aggregation
    if (params.aggregation) {
      const validAggregationTypes: AggregationType[] = [
        'median',
        'mean',
        'min',
        'max',
      ]
      const aggregations = Array.isArray(params.aggregation)
        ? params.aggregation
        : [params.aggregation]
      aggregations.forEach((agg) => {
        if (!validAggregationTypes.includes(agg)) {
          throw new Error(`Invalid aggregation type: ${agg}`)
        }
      })
    }

    // Check maxSourcesDeviation
    if (
      params.maxSourcesDeviation !== undefined &&
      params.maxSourcesDeviation <= 0
    ) {
      throw new Error('maxSourcesDeviation must be positive')
    }

    // Check maxValidationDiff
    if (
      params.maxValidationDiff !== undefined &&
      params.maxValidationDiff <= 0
    ) {
      throw new Error('maxValidationDiff must be positive')
    }
  }

  /**
   * Fetches price data from the oracle network.
   * @param {FetchPricesParams} params - The parameters for fetching prices.
   * @param {number} verifications - The number of verifications required (default: 0).
   * @returns {Promise<GetPricesResult[]>} A promise that resolves to an array of combined signed prices.
   */
  async getPrices(
    params: FetchPricesParams,
    verifications: number = 0
  ): Promise<GetPricesResult[]> {
    await this.initPromise

    this.validateFetchPricesParams(params)

    const fetchPrices = async (
      params: FetchPricesParams,
      requiredResponses: number,
      validCheck: boolean = false
    ): Promise<OracleResponse<FetchPricesResult>[]> => {
      const responses = await this.sendRequestToOracles<FetchPricesResult>(
        'fetchPrices',
        params,
        requiredResponses
      )

      return validCheck
        ? responses.filter(
            (response) =>
              response.result.priceInfos.length > 0 &&
              response.result.priceInfos.every((priceInfo: PriceInfo) =>
                this.isValidResponse(priceInfo)
              )
          )
        : responses
    }

    const handleInsufficientResponses = (
      validResponses: OracleResponse<FetchPricesResult>[],
      required: number
    ) => {
      if (validResponses.length < required) {
        throw new Error(
          `Only ${validResponses.length} valid responses received, ${required} required`
        )
      }
    }

    const handlePriceErrors = (
      responses: OracleResponse<FetchPricesResult>[]
    ) => {
      if (responses.length > 0) {
        const priceErrors = responses.flatMap(
          (response) => response.result.priceErrors
        )
        if (priceErrors.length > 0) {
          this.log(
            `fetchPrices errors: \n${priceErrors
              .map((error) => `${error.from}-${error.to} : ${error.message}`)
              .join(',\n')}`,
            'error'
          )
        }
      }
    }

    const getVerificationParamsFromInitalResponses = async (
      initialResponses: OracleResponse<FetchPricesResult>[]
    ) => {
      // Merge the responses
      const mergedResponse: FetchPricesResult = {
        priceInfos: [],
        priceErrors: [],
        signedPrices: [],
        version: initialResponses[0].result.version,
      }

      // Collect all priceInfos and signedPrices
      for (const response of initialResponses) {
        mergedResponse.priceInfos.push(...response.result.priceInfos)
        mergedResponse.signedPrices.push(...response.result.signedPrices)
      }

      // Handle priceErrors - only add if present in all responses
      const allErrors = initialResponses.map(
        (response) => response.result.priceErrors
      )
      const commonErrors = allErrors.reduce(
        (common, errors) =>
          common.filter((error) =>
            errors.some(
              (e) =>
                e.from === error.from &&
                e.to === error.to &&
                e.message === error.message
            )
          ),
        allErrors[0] || []
      )
      mergedResponse.priceErrors = commonErrors

      // Remove duplicates from priceInfos based on 'from' and 'to' fields
      mergedResponse.priceInfos = mergedResponse.priceInfos.filter(
        (info, index, self) =>
          index ===
          self.findIndex((t) => t.from === info.from && t.to === info.to)
      )

      // Remove duplicates from signedPrices based on 'from' and 'to' fields in priceData
      mergedResponse.signedPrices = mergedResponse.signedPrices.filter(
        (signed, index, self) =>
          index ===
          self.findIndex(
            (t) =>
              t.priceData.from === signed.priceData.from &&
              t.priceData.to === signed.priceData.to
          )
      )

      this.log(
        `📬 Initial prices fetched: 
      ${mergedResponse.priceInfos
        .map(
          (info) =>
            `${info.from}-${info.to}: ${Object.entries(info.price)
              .map(([type, value]) => `${type}=${value}`)
              .join(', ')}`
        )
        .join(', ')}`
      )

      // Create a set of pairs that returned errors
      const errorPairs = new Set(
        mergedResponse.priceErrors.map((error) => `${error.from}-${error.to}`)
      )
      // Filter out the pairs that are in priceErrors
      const validPairs = params.pairs.filter(
        (pair) => !errorPairs.has(`${pair.from}-${pair.to}`)
      )

      const verificationParams = {
        ...params,
        pairs: validPairs.map((pair, index) => ({
          ...pair,
          price: Object.values(mergedResponse.priceInfos[index].price),
          timestamp: mergedResponse.priceInfos[index].timestamp,
        })),
      }

      return verificationParams
    }

    // If prices are already provided, skip the initial fetch
    if (params.pairs.every((pair) => pair.price !== undefined)) {
      const validResponses = await fetchPrices(params, verifications, true)
      handlePriceErrors(validResponses)
      handleInsufficientResponses(validResponses, verifications)
      return this.combineSignedPrices(validResponses)
    } else {
      // Otherwise, fetch initial prices and use them for verification
      this.log(
        `⭐ ${params.pairs.map(
          (pair) => pair.from + '-' + pair.to
        )} Fetching initial prices for verification...`
      )
      //fetch 3 initial responses to get initial prices for verification
      const initialResponses = await fetchPrices(params, 3)
      handlePriceErrors(initialResponses)
      handleInsufficientResponses(initialResponses, 3)

      const verificationParams = await getVerificationParamsFromInitalResponses(
        initialResponses
      )

      const validVerifications = await fetchPrices(
        verificationParams,
        verifications,
        true
      )
      handlePriceErrors(validVerifications)
      handleInsufficientResponses(validVerifications, verifications)
      this.log(`🟢 Verifications: ${validVerifications.length}`)
      return this.combineSignedPrices(validVerifications)
    }
  }

  private combineSignedPrices(
    responses: OracleResponse<FetchPricesResult>[]
  ): GetPricesResult[] {
    if (responses.length === 0) {
      return []
    }

    // Use the first response's priceData for each pair
    const combinedSignedPrices = responses[0].result.signedPrices.map(
      (firstSignedPrice) => {
        const allSignedPrices = responses.flatMap((response) =>
          response.result.signedPrices
            .filter(
              (sp) =>
                sp.priceData.from === firstSignedPrice.priceData.from &&
                sp.priceData.to === firstSignedPrice.priceData.to
            )
            .map((sp) => ({
              ...sp,
              pubKey: this.idToPubKeyMap[response.sender],
            }))
        )

        return {
          priceData: firstSignedPrice.priceData,
          packed: allSignedPrices.map((sp) => sp.packed),
          signatures: allSignedPrices.map((sp) => sp.signature),
          pubKeys: allSignedPrices.map((sp) => sp.pubKey),
        }
      }
    )

    return combinedSignedPrices
  }

  /**
   * Retrieves a list of available exchanges.
   * @param {CheckExchangeHealthParams} params - The parameters for checking exchange health.
   * @returns {Promise<string[]>} A promise that resolves to an array of available exchange IDs.
   */
  async getExchanges(
    params?: CheckExchangeHealthParams,
    requiredResponses: number = 0
  ): Promise<string[]> {
    return this.sendRequestToOracles<CheckExchangeHealthResult>(
      'checkExchangeHealth',
      params || {},
      requiredResponses
    )
      .then((responses) => {
        const exchanges: Set<string> = new Set()
        responses.forEach((response) => {
          response.result.healthStatuses
            .filter((info) => info.status === 'up')
            .forEach((info) => exchanges.add(info.exchangeId))
        })
        return Array.from(exchanges)
      })
      .catch((error) => {
        this.log(`❌ Error checking exchange health: ${error}`, 'error')
        throw error
      })
  }

  /**
   * Pings the oracles.
   * @returns {Promise<{ status: string; timestamp: number, pubKey: string }[]>} A promise that resolves to the list reachable oracles.
   */
  async ping(): Promise<
    { status: string; timestamp: number; pubKey: string }[]
  > {
    await this.initPromise

    try {
      const responses = await this.sendRequestToOracles<{
        status: string
        timestamp: number
      }>('ping', {}, this.oracles.length, false)

      if (responses.length === 0) {
        throw new Error('No response received from oracles')
      }

      const pingResults = responses.map((response) => ({
        status: response.result.status,
        timestamp: response.result.timestamp,
        pubKey: this.idToPubKeyMap[response.sender],
      }))

      return pingResults
    } catch (error) {
      this.log(`❌ Error pinging oracles: ${error}`, 'error')
      throw error
    }
  }

  /**
   * Retrieves the list of oracles.
   * @returns {Promise<string[]>} A promise that resolves to an array of oracle IDs.
   */
  async getOracles(): Promise<string[]> {
    await this.initPromise
    return this.oracles
  }

  /**
   * Closes the WebSocket connection.
   * @returns {Promise<void>} A promise that resolves when the connection is closed.
   */
  async close(): Promise<void> {
    await this.initPromise
    this.client.close()
  }

  private log(
    message: string,
    type: 'default' | 'warn' | 'error' = 'default'
  ): void {
    switch (type) {
      case 'warn':
        console.warn(message)
        break
      case 'error':
        console.error(message)
        break
      default:
        if (this.logging) {
          console.log(message)
        }
    }
  }
}
