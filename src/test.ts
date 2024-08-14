// src/localTest.ts

import { AcurastOracleSDK } from './index'
import { FetchPricesParams } from './types'

const WSS_URLS = [
  // 'wss://websocket-proxy-1.prod.gke.acurast.com',
  'wss://websocket-proxy-2.prod.gke.acurast.com',
]

const ORACLE_PUBLIC_KEYS = [
  '7cba1b4337e1f2e6fd5b2257df1dfc8d',
  '7cba1b4337e1f2e6fd5b2257df1dfc8d',
]

async function main() {
  const sdk = new AcurastOracleSDK({
    websocketUrls: WSS_URLS,
    oracles: ORACLE_PUBLIC_KEYS,
  })

  try {
    console.log('Fetching price data BTC USDT...')
    const priceParams: FetchPricesParams = {
      pairs: [
        { from: 'BTC', to: 'USDT' },
        { from: 'ETH', to: 'USDT' },
      ],
      protocol: 'EVM',
      exchanges: ['BNC', 'CBP', 'KRK', 'OKX', 'UPB'],
      aggregation: 'mean',
      minSources: 1,
      maxValidationDiff: 0.1,
      tradeAgeLimit: 1800000,
    }

    const prices = await sdk.getPrice(priceParams, 2)
    console.log(
      'TEST: received price:',
      prices.map((price) => price.priceData.price)
    )
    // sdk.getPrice(priceParams2)

    // console.log('\nFetching exchange health...')
    // const exchangeHealth = await sdk.getExchanges({ exchanges: ['OKX', 'UPB'] })
    // console.log('Available Exchanges:', JSON.stringify(exchangeHealth, null, 2))
  } catch (error) {
    console.error('Error:', error)
  } finally {
    await sdk.close()
  }
}

main()
