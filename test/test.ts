import { AcelonSdk } from '../dist/index'
import { AcelonSdkOptions, FetchPricesParams } from '../dist/types'

async function testSDK() {
  const options: AcelonSdkOptions = {
    wssUrls: ['wss://websocket-proxy-2.prod.gke.acurast.com'],
    oracles: [
      '0x03d978f37aa84d7859f885b0d5a46ecc1f73907993c622f5cfe2441468ca877c74',
      '0x03ac212ecc7bca734cb30bd38df2bea9ed2dd8d6cc63132f3c51957c2ccb7aeb04',
      '0x02ed3e0cb56f50c38ef953a61238880b26520ad32fecd09a3f515fcf6e83202f9c',
      '0x03fff0c248fba1b520463494161566b2c95f12eccc6cafabd267c82f8cf5fc95a8',
      '0x035a3b10ae00d3c32319baebaee9d99d042e35394e1f96cc451ec5d0ee85421b39',
    ],
    errorThreshold: 0.333,
    logging: true,
  }

  const acelonSdk = new AcelonSdk(options)

  try {
    const params: FetchPricesParams = {
      pairs: [
        {
          from: 'BTC',
          to: 'USDT',
          decimals: 6,
        },
        {
          from: 'XTZ',
          to: 'USDT',
          decimals: 6,
        },
        {
          from: 'XXX',
          to: 'USD',
          decimals: 6,
        },
      ],
      protocol: 'Youves',
      aggregation: ['median'],
    }

    const prices = await acelonSdk.getPrices(params, 0)

    console.log('Prices:', JSON.stringify(prices, null, 2))
  } catch (error) {
    console.error('Error:', error)
  }
}

testSDK()
