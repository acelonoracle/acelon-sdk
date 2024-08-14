import { AcurastClient } from '@acurast/dapp'
import { ec } from 'elliptic'
import { Buffer } from 'buffer'
import { v4 as uuidv4 } from 'uuid'
import {
  AcurastOracleSDKOptions,
  CheckExchangeHealthResult,
  CheckExchangeHealthParams,
  FetchPricesParams,
  FetchPricesResult,
  SignedPrice,
} from './types'

export class AcurastOracleSDK {
  private client: AcurastClient
  private keyPair: { privateKey: string; publicKey: string }
  private pendingRequests: Map<
    string,
    { resolve: Function; reject: Function; timer: NodeJS.Timeout }
  > = new Map()
  private initPromise: Promise<void>
  private oracles: string[]
  private timeout: number

  constructor(options: AcurastOracleSDKOptions) {
    this.client = new AcurastClient(options.websocketUrls)
    this.keyPair = this.generateKeyPair()
    this.oracles = options.oracles || []
    this.timeout = options.timeout || 30000 // Default 30 seconds timeout
    this.initPromise = this.init()
  }

  private async init(): Promise<void> {
    console.log('🛜 Opening websocket connection ...')
    try {
      await this.client.start({
        secretKey: this.keyPair.privateKey,
        publicKey: this.keyPair.publicKey,
      })
      console.log('✅ Connection opened')

      this.client.onMessage(this.handleMessage.bind(this))
    } catch (error) {
      console.error('❌ Failed to open connection:', error)
      throw error
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
      // console.log('📦 Parsed payload:', JSON.stringify(payload, null, 2))

      const pendingRequest = this.pendingRequests.get(payload.id)
      if (pendingRequest) {
        clearTimeout(pendingRequest.timer)
        this.pendingRequests.delete(payload.id)

        if (payload.error) {
          pendingRequest.reject(
            new Error(payload.error.message || 'Unknown error')
          )
        } else {
          pendingRequest.resolve(payload.result)
        }
      } else {
        console.warn('⚠️ Received response for unknown request:', payload)
      }
    } catch (error) {
      console.error('❌ Error parsing message:', error)
    }
  }

  private async sendRequest(method: string, params: any): Promise<any> {
    await this.initPromise

    return new Promise((resolve, reject) => {
      const id = uuidv4()
      const request = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      }

      const timer = setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`Request timed out after ${this.timeout}ms`))
        }
      }, this.timeout)

      this.pendingRequests.set(id, { resolve, reject, timer })

      const message = JSON.stringify(request)
      console.log(`📤 Sending ${method} request to oracles:`, message)

      this.oracles.forEach(async (oracle) => {
        try {
          await this.client.send(oracle, message)
        } catch (error) {
          console.error(`❌ Failed to send message to oracle ${oracle}:`, error)
        }
      })
    })
  }

  async getPrice(params: FetchPricesParams): Promise<any> {
    return this.sendRequest('fetchPrices', params)
      .then((result: FetchPricesResult) => {
        return result.signedPrices.map((signedPrice: SignedPrice) => {
          return signedPrice
        })
      })
      .catch((error) => {
        console.error('❌ Error fetching prices:', error)
        throw error
      })
  }

  async getExchanges(params: CheckExchangeHealthParams): Promise<any> {
    return this.sendRequest('checkExchangeHealth', params)
      .then((result: CheckExchangeHealthResult) => {
        return result.healthStatuses
          .filter((info) => info.status === 'up')
          .map((info) => info.exchangeId)
      })
      .catch((error) => {
        console.error('❌ Error checking exchange health:', error)
        throw error
      })
  }

  async close(): Promise<void> {
    await this.initPromise
    this.client.close()
  }
}
