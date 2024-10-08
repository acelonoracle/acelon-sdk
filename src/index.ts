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
  GetPricesResult,
  OracleResponse,
  AggregationType,
  Protocol,
  PriceInfo,
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
      validResponses: Map<string, any>
      errorResponses: Map<string, any>
      errorCounts: Map<number, number>
      requiredResponses: number
      validCheck: boolean
      requestedPairsCount: number | undefined
      checkAndResolve: () => void
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
      this.log(
        `Fetched default settings: ${defaultSettings.wssUrls.length} wssUrls, ${defaultSettings.oracles.length} oracles`
      )
    }

    if (options.oracles && options.oracles.length > 0) {
      this.log(`Using provided oracles ...`)
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
      this.log(`📦 Received payload from ${sender} for request ${payload.id}`)

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
          const response = {
            result: payload.result,
            sender,
          }
          pendingRequest.responses.set(sender, response)

          if (
            pendingRequest.validCheck &&
            this.isValidResponse(
              payload.result,
              pendingRequest.requestedPairsCount || 0
            )
          ) {
            pendingRequest.validResponses.set(sender, response)
          }
        }

        pendingRequest.checkAndResolve()
      } else {
        // If we receive a response for a request we're not tracking, ignore it
        //this.log(`🥱 Received response for untracked request ... ignoring ${payload}`, "warn")
      }
    } catch (error) {
      this.log(`❌ Error parsing message: ${error}`, 'error')
    }
  }

  private isValidResponse(
    result: FetchPricesResult,
    requestedPairsCount: number
  ): boolean {
    if (!result.priceInfos) {
      this.log('⚠️ Invalid response: priceInfos is missing', 'warn')
      return false
    }

    if (result.priceInfos.length !== requestedPairsCount) {
      this.log(
        `⚠️ Invalid response: ${
          result.priceInfos.length
        } / ${requestedPairsCount} expected pairs : ${result.priceInfos
          .map((p: PriceInfo) => `${p.from}-${p.to}`)
          .join(', ')}`,
        'warn'
      )
      return false
    }

    for (let i = 0; i < result.priceInfos.length; i++) {
      const priceInfo = result.priceInfos[i]
      if (!priceInfo.validation) {
        this.log(
          `⚠️ Invalid response: Validation missing for pair ${i + 1} (${
            priceInfo.from
          }-${priceInfo.to})`,
          'warn'
        )
        return false
      }

      const invalidValidations = Object.entries(priceInfo.validation)
        .filter(([key, value]) => value !== true)
        .map(([key]) => key)

      if (invalidValidations.length > 0) {
        this.log(
          `❌ Invalid response: ${priceInfo.from}-${
            priceInfo.to
          } - ${invalidValidations.join(', ')} : ${JSON.stringify(
            priceInfo.price
          )}`,
          'warn'
        )

        return false
      }
    }

    this.log('✅ Valid response: All validations passed', 'default')
    return true
  }

  // Sends a request to multiple oracles and waits for responses
  // Returns a promise that resolves when enough responses are received - or rejects on timeout
  private async sendRequestToOracles<T>(
    method: string,
    params: FetchPricesParams | CheckExchangeHealthParams,
    requiredResponses: number = 0,
    enableTimeoutError: boolean = true,
    validCheck: boolean = false
  ): Promise<OracleResponse<T>[]> {
    await this.initPromise

    return new Promise((resolve, reject) => {
      const requestId = uuidv4()
      const responses = new Map<string, OracleResponse<T>>()
      const validResponses = new Map<string, OracleResponse<T>>()
      const errorResponses = new Map<string, OracleResponse<T>>()
      const errorCounts = new Map<number, number>()

      // Get the number of requested pairs if it's a FetchPricesParams
      const requestedPairsCount =
        (params as FetchPricesParams).pairs?.length || undefined

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          if (enableTimeoutError) {
            this.pendingRequests.delete(requestId)
            reject(
              new Error(
                `⌛ Request ${requestId} timed out after ${this.timeout}ms`
              )
            )
          } else {
            const collectedResponses = Array.from(
              validCheck ? validResponses.values() : responses.values()
            )
            this.pendingRequests.delete(requestId)
            resolve(collectedResponses)
          }
        }
      }, this.timeout)

      const checkAndResolve = () => {
        if (
          (validCheck && validResponses.size >= requiredResponses) ||
          (!validCheck && responses.size >= requiredResponses)
        ) {
          clearTimeout(timer)
          this.pendingRequests.delete(requestId)
          resolve(
            Array.from(
              validCheck ? validResponses.values() : responses.values()
            )
          )
        }
      }

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timer,
        responses,
        validResponses,
        errorResponses,
        errorCounts,
        requiredResponses,
        validCheck,
        requestedPairsCount,
        checkAndResolve,
      })

      this.log(
        `📤 Sending ${method} request ${requestId} to ${
          this.oracles.length
        } oracles :\n${JSON.stringify(params)}`
      )

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
    // this.log(`📤 Sending ${method} request to oracle ${oracle}: ${message}`)

    await this.client.send(oracle, message)
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
    params.pairs.forEach((pair, index) => {
      if (
        pair.exchanges &&
        params.minSources &&
        params.minSources > pair.exchanges.length
      ) {
        throw new Error(
          `minSources (${params.minSources}) cannot be greater than the number of exchanges (${pair.exchanges.length}) for pair at index ${index}`
        )
      }
    })

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
      return this.sendRequestToOracles<FetchPricesResult>(
        'fetchPrices',
        params,
        requiredResponses,
        true,
        validCheck
      )
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

    const getVerificationParamsFromInitalResponses = (
      initialResponses: OracleResponse<FetchPricesResult>[]
    ): FetchPricesParams => {
      const pairData: Record<string, { price: number[]; timestamp: number }> =
        {}
      const pairExchanges: Record<string, Map<string, number>> = {}

      // Step 1: Extract prices and timestamps for each pair
      initialResponses.forEach((response) => {
        response.result.priceInfos.forEach((info) => {
          const pairKey = `${info.from}-${info.to}`
          if (!pairData[pairKey]) {
            pairData[pairKey] = {
              price: Object.values(info.price),
              timestamp: info.timestamp,
            }
          }

          // Step 2: Count exchanges for each pair
          if (!pairExchanges[pairKey]) {
            pairExchanges[pairKey] = new Map()
          }
          info.sources.forEach((source) => {
            const count = pairExchanges[pairKey].get(source.exchangeId) || 0
            pairExchanges[pairKey].set(source.exchangeId, count + 1)
          })
        })
      })

      this.log(
        `📬 Initial prices fetched: ${Object.entries(pairData)
          .map(([pairKey, data]) => `${pairKey} ${data.price.join(', ')}`)
          .join(' , ')}`
      )

      // Step 3: Select top exchanges for each pair
      const selectedExchanges: Record<string, string[]> = {}
      Object.keys(pairExchanges).forEach((pairKey) => {
        const exchanges = Array.from(pairExchanges[pairKey].entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, params.minSources || 1)
          .map(([exchangeId]) => exchangeId)
        selectedExchanges[pairKey] = exchanges
      })

      // Step 4: Prepare verification params
      const verificationParams: FetchPricesParams = {
        ...params,
        pairs: params.pairs
          .filter((pair) => {
            const pairKey = `${pair.from}-${pair.to}`
            return pairData.hasOwnProperty(pairKey)
          })
          .map((pair) => {
            const pairKey = `${pair.from}-${pair.to}`
            const data = pairData[pairKey]
            return {
              ...pair,
              price: data.price,
              timestamp: data.timestamp,
              exchanges: selectedExchanges[pairKey], // Update exchanges per pair
            }
          }),
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
      //fetch initial responses to get initial prices for verification
      const requiredInitial = Math.min(verifications, 3) || 1

      const initialResponses = await fetchPrices(params, requiredInitial)
      handlePriceErrors(initialResponses)
      handleInsufficientResponses(initialResponses, requiredInitial)

      const verificationParams = await getVerificationParamsFromInitalResponses(
        initialResponses
      )

      const validVerifications = await fetchPrices(
        verificationParams,
        verifications,
        true
      )
      // this.log(`Verification params: ${JSON.stringify(verificationParams)}`)

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
          response.result.signedPrices.filter(
            (sp) =>
              sp.priceData.from === firstSignedPrice.priceData.from &&
              sp.priceData.to === firstSignedPrice.priceData.to
          )
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
