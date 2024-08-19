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
  CombinedSignedPrice,
  PriceInfo,
  AggregationType,
} from "./types"

type OracleResponse<T> = {
  result: T
  sender: string
}

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
      requiredResponses: number
    }
  > = new Map()
  private initPromise: Promise<void>
  private oracles: string[]
  private timeout: number

  private idToPubKeyMap: Record<string, string> = {}

  constructor(options: AcurastOracleSDKOptions) {
    this.client = new AcurastClient(options.websocketUrls)
    this.keyPair = this.generateKeyPair()
    this.oracles = options.oracles || [] //TODO set default oracles
    this.timeout = options.timeout || 30 * 1000 // Default 10 seconds timeout
    this.initPromise = this.init()
  }

  // Initialize the WebSocket connection and sets up message handling
  private async init(): Promise<void> {
    console.log("🛜 Opening websocket connection ...")
    try {
      await this.client.start({
        secretKey: this.keyPair.privateKey,
        publicKey: this.keyPair.publicKey,
      })
      console.log("✅ Connection opened")

      // map oracle public keys to their ids
      this.idToPubKeyMap = {}
      this.oracles.map((oracle) => {
        const id = this.client.idFromPublicKey(oracle)
        this.idToPubKeyMap[id] = oracle
      })

      this.client.onMessage(this.handleMessage.bind(this))
    } catch (error) {
      console.error("❌ Failed to open connection:", error)
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
      console.log("📦 Parsed payload:", JSON.stringify(payload, null, 2))

      // Requests are divided by ID. Each call to sendRequestToOracles creates a new ID, so we can
      // track the responses for each request separately
      const pendingRequest = this.pendingRequests.get(payload.id)
      if (pendingRequest) {
        pendingRequest.responses.set(sender, { result: payload.result, sender })

        // If we've received enough responses, resolve the promise
        if (pendingRequest.responses.size >= pendingRequest.requiredResponses) {
          clearTimeout(pendingRequest.timer)
          this.pendingRequests.delete(payload.id)
          pendingRequest.resolve(Array.from(pendingRequest.responses.values()))
        }
      } else {
        // If we receive a response for a request we're not tracking, ignore it
        console.warn("🥱 Received response for untracked request ... ingnoring", payload)
      }
    } catch (error) {
      console.error("❌ Error parsing message:", error)
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
      const responses = new Map<string, any>()

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
        requiredResponses,
      })

      this.oracles.forEach((oracle) => {
        this.sendRequest(method, params, oracle, requestId).catch((error) => {
          console.error(`❌ Failed to send request to oracle ${oracle}:`, error)
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
    console.log(`📤 Sending ${method} request to oracle ${oracle}:`, message)

    await this.client.send(oracle, message)
  }

  // Check if all prices in a response are valid
  private isValidResponse(priceInfo: PriceInfo): boolean {
    if (!priceInfo.validation) return false
    return Object.values(priceInfo.validation).every((value) => value === true)
  }

  async getPrice(params: FetchPricesParams, verifications: number = 0): Promise<CombinedSignedPrice[]> {
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
      console.log(
        `⭐ ${params.pairs.map((pair) => pair.from + "-" + pair.to)} Fetching initial prices for verification...`
      )
      const initialResponses = await fetchPrices(params, 1)
      handleInsufficientResponses(initialResponses, 1)
      const firstResponse = initialResponses[0].result
      console.log("📬 Initial prices fetched:", firstResponse)

      const verificationParams = {
        ...params,
        pairs: params.pairs.map((pair, index) => ({
          ...pair,
          price:
            firstResponse.priceInfos[index].price[
              Object.keys(firstResponse.priceInfos[index].price)[0] as AggregationType
            ],
          timestamp: firstResponse.priceInfos[index].timestamp,
        })),
      }

      const validVerifications = await fetchPrices(verificationParams, verifications, true)
      handleInsufficientResponses(validVerifications, verifications)
      console.log("🟢 Verifications:", validVerifications.length)
      return this.combineSignedPrices(validVerifications)
    }
  }

  private combineSignedPrices(responses: OracleResponse<FetchPricesResult>[]): CombinedSignedPrice[] {
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

  async getExchanges(params: CheckExchangeHealthParams): Promise<string[]> {
    return this.sendRequestToOracles<CheckExchangeHealthResult>("checkExchangeHealth", params)
      .then((responses) => {
        return responses[0].result.healthStatuses.filter((info) => info.status === "up").map((info) => info.exchangeId)
      })
      .catch((error) => {
        console.error("❌ Error checking exchange health:", error)
        throw error
      })
  }

  async close(): Promise<void> {
    await this.initPromise
    this.client.close()
  }
}
