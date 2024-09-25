import { AcelonSdk } from '../dist/index'
import { AcelonSdkOptions, FetchPricesParams } from '../dist/types'

async function testSDK() {
  const options: AcelonSdkOptions = {
    errorThreshold: 0.333,
    timeout: 20000,
    logging: true,
  }

  const acelonSdk = new AcelonSdk(options)

  // const ping = await acelonSdk.ping()
  // console.log('Ping:', ping)

  try {
    const params: FetchPricesParams = {
      pairs: [
        {
          from: 'BTC',
          to: 'USDT',
          decimals: 6,
        },
        {
          from: 'USDT',
          to: 'USD',
          decimals: 6,
        },
        {
          from: 'XTZ',
          to: 'USDT',
          decimals: 6,
        },
      ],
      protocol: 'Tezos',
      aggregation: ['median'],
    }

    const prices = await acelonSdk.getPrices(params, 3)

    console.log('Prices:', JSON.stringify(prices, null, 2))
  } catch (error) {
    console.error('Error:', error)
  }
}

testSDK()
