import { AcurastClient } from "@acurast/dapp"
import { ec } from "elliptic"
import { Buffer } from "buffer"
import { v4 as uuidv4 } from "uuid"
import {
  AcurastOracleSDKOptions,
  CheckExchangeHealthResult,
  CheckExchangeHealthParams,
  FetchPricesParams,
  FetchPricesResult,
  PriceInfo,
  AggregationType,
  GetPricesResult,
  OracleResponse,
} from "./types"

/**
 * AcurastOracleSDK provides methods to interact with the Acurast Oracle network.
 */
export class AcurastOracleSDK {
  private client: AcurastClient
  private keyPair: { privateKey: string; publicKey: string }
  private pendingRequests: Map<
    string,
    {
      resolve: Function
      reject: Function
      timer: NodeJS.Timeout
      responses: Map<string, any>
      errorResponses: Map<string, any>
      requiredResponses: number
    }
  > = new Map()
  private initPromise: Promise<void>
  private oracles: string[]
  private timeout: number
  private logging: boolean

  private idToPubKeyMap: Record<string, string> = {}

  /**
   * Creates an instance of AcurastOracleSDK.
   * @param {AcurastOracleSDKOptions} options - The configuration options.
   */
  constructor(options: AcurastOracleSDKOptions) {
    this.client = new AcurastClient(options.wssUrls)
    this.keyPair = this.generateKeyPair()
    this.oracles = options.oracles || [] //TODO set default oracles
    this.timeout = options.timeout || 10 * 1000 // Default 10 seconds timeout
    this.logging = options.logging || false

    this.initPromise = this.init()
  }

  // Initialize the WebSocket connection and sets up message handling
  private async init(): Promise<void> {
    this.log("🛜 Opening websocket connection ...")
    try {
      await this.client.start({
        secretKey: this.keyPair.privateKey,
        publicKey: this.keyPair.publicKey,
      })
      this.log("✅ Connection opened")

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

  private generateKeyPair() {
    const EC = new ec("p256")
    const keyPair = EC.genKeyPair()
    return {
      privateKey: keyPair.getPrivate("hex"),
      publicKey: keyPair.getPublic(true, "hex"),
    }
  }
  private handleMessage(message: any) {
    try {
      const payload = JSON.parse(Buffer.from(message.payload, "hex").toString())
      const sender = Buffer.from(message.sender).toString("hex")
      this.log(`📦 Received payload from ${sender}`)

      // Requests are divided by ID. Each call to sendRequestToOracles creates a new ID, so we can
      // track the responses for each request separately
      const pendingRequest = this.pendingRequests.get(payload.id)
      if (pendingRequest) {
        if (payload.error) {
          this.log(`❌ Received error from ${sender}: ${JSON.stringify(payload.error)}`, "error")
          pendingRequest.errorResponses.set(sender, { error: payload.error, sender })
        } else {
          pendingRequest.responses.set(sender, { result: payload.result, sender })
        }

        const totalResponses = pendingRequest.responses.size + pendingRequest.errorResponses.size
        const remainingOracles = this.oracles.length - totalResponses
        // If we've received enough responses, resolve the promise
        if (pendingRequest.responses.size >= pendingRequest.requiredResponses) {
          clearTimeout(pendingRequest.timer)
          this.pendingRequests.delete(payload.id)
          pendingRequest.resolve(Array.from(pendingRequest.responses.values()))
        } else if (remainingOracles + pendingRequest.responses.size < pendingRequest.requiredResponses) {
          // If it will not be possible to get enough responses, reject the promise
          clearTimeout(pendingRequest.timer)
          this.pendingRequests.delete(payload.id)
          pendingRequest.reject(
            new Error(
              `Insufficient responses: ${pendingRequest.responses.size} success, ${pendingRequest.errorResponses.size} errors, ${remainingOracles} remaining`
            )
          )
        }
      } else {
        // If we receive a response for a request we're not tracking, ignore it
        this.log(`🥱 Received response for untracked request ... ignoring ${payload}`, "warn")
      }
    } catch (error) {
      this.log(`❌ Error parsing message: ${error}`, "error")
    }
  }

  // Sends a request to multiple oracles and waits for responses
  // Returns a promise that resolves when enough responses are received - or rejects on timeout
  private async sendRequestToOracles<T>(
    method: string,
    params: FetchPricesParams | CheckExchangeHealthParams,
    requiredResponses: number = 0
  ): Promise<OracleResponse<T>[]> {
    await this.initPromise

    return new Promise((resolve, reject) => {
      const requestId = uuidv4()
      const responses = new Map<string, OracleResponse<T>>()
      const errorResponses = new Map<string, OracleResponse<T>>()

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId)
          reject(new Error(`⌛ Request timed out after ${this.timeout}ms`))
        }
      }, this.timeout)

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timer,
        responses,
        errorResponses,
        requiredResponses,
      })

      this.oracles.forEach((oracle) => {
        this.sendRequest(method, params, oracle, requestId).catch((error) => {
          this.log(`❌ Failed to send request to oracle ${oracle}: ${error}`, "error")
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
      jsonrpc: "2.0",
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

  /**
   * Fetches price data from the oracle network.
   * @param {FetchPricesParams} params - The parameters for fetching prices.
   * @param {number} verifications - The number of verifications required (default: 0).
   * @returns {Promise<GetPricesResult[]>} A promise that resolves to an array of combined signed prices.
   */
  async getPrices(params: FetchPricesParams, verifications: number = 0): Promise<GetPricesResult[]> {
    await this.initPromise

    const fetchPrices = async (
      params: FetchPricesParams,
      requiredResponses: number,
      validCheck: boolean = false
    ): Promise<OracleResponse<FetchPricesResult>[]> => {
      const responses = await this.sendRequestToOracles<FetchPricesResult>("fetchPrices", params, requiredResponses)

      return validCheck
        ? responses.filter((response) =>
            response.result.priceInfos.every((priceInfo: PriceInfo, index: number) => this.isValidResponse(priceInfo))
          )
        : responses
    }

    const handleInsufficientResponses = (validResponses: OracleResponse<FetchPricesResult>[], required: number) => {
      if (validResponses.length < required) {
        throw new Error(`Only ${validResponses.length} valid responses received, ${required} required`)
      }
    }

    // If no verifications are required, return the first response
    if (verifications === 0) {
      const responses = await fetchPrices(params, 1)
      handleInsufficientResponses(responses, 1)
      return this.combineSignedPrices(responses)
    }

    // If prices are already provided, skip the initial fetch
    if (params.pairs.every((pair) => pair.price !== undefined)) {
      const validResponses = await fetchPrices(params, verifications, true)
      handleInsufficientResponses(validResponses, verifications)
      return this.combineSignedPrices(validResponses)
    } else {
      // Otherwise, fetch initial prices and use them for verification
      this.log(
        `⭐ ${params.pairs.map((pair) => pair.from + "-" + pair.to)} Fetching initial prices for verification...`
      )
      const initialResponses = await fetchPrices(params, 1)
      handleInsufficientResponses(initialResponses, 1)
      const firstResponse = initialResponses[0].result
      this.log(`📬 Initial prices fetched: ${firstResponse}`)

      const verificationParams = {
        ...params,
        pairs: params.pairs.map((pair, index) => ({
          ...pair,
          price: Object.values(firstResponse.priceInfos[index].price),
          timestamp: firstResponse.priceInfos[index].timestamp,
        })),
      }

      const validVerifications = await fetchPrices(verificationParams, verifications, true)
      handleInsufficientResponses(validVerifications, verifications)
      this.log(`🟢 Verifications: ${validVerifications.length}`)
      return this.combineSignedPrices(validVerifications)
    }
  }

  private combineSignedPrices(responses: OracleResponse<FetchPricesResult>[]): GetPricesResult[] {
    if (responses.length === 0) {
      return []
    }

    // Use the first response's priceData for each pair
    const combinedSignedPrices = responses[0].result.signedPrices.map((firstSignedPrice) => {
      const allSignedPrices = responses.flatMap((response) =>
        response.result.signedPrices
          .filter(
            (sp) =>
              sp.priceData.from === firstSignedPrice.priceData.from && sp.priceData.to === firstSignedPrice.priceData.to
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
    })

    return combinedSignedPrices
  }

  /**
   * Retrieves a list of available exchanges.
   * @param {CheckExchangeHealthParams} params - The parameters for checking exchange health.
   * @returns {Promise<string[]>} A promise that resolves to an array of available exchange IDs.
   */
  async getExchanges(params?: CheckExchangeHealthParams, requiredResponses: number = 0): Promise<string[]> {
    return this.sendRequestToOracles<CheckExchangeHealthResult>("checkExchangeHealth", params || {}, requiredResponses)
      .then((responses) => {
        const exchanges: Set<string> = new Set()
        responses.forEach((response) => {
          response.result.healthStatuses
            .filter((info) => info.status === "up")
            .forEach((info) => exchanges.add(info.exchangeId))
        })
        return Array.from(exchanges)
      })
      .catch((error) => {
        this.log(`❌ Error checking exchange health: ${error}`, "error")
        throw error
      })
  }

  /**
   * Closes the WebSocket connection.
   * @returns {Promise<void>} A promise that resolves when the connection is closed.
   */
  async close(): Promise<void> {
    await this.initPromise
    this.client.close()
  }

  private log(message: string, type: "default" | "warn" | "error" = "default"): void {
    switch (type) {
      case "warn":
        console.warn(message)
        break
      case "error":
        console.error(message)
        break
      default:
        if (this.logging) {
          console.log(message)
        }
    }
  }
}
