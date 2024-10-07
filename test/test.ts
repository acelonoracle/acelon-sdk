import { AcelonSdk } from '../dist/index'
import { AcelonSdkOptions, FetchPricesParams } from '../dist/types'

async function testSDK() {
  const options: AcelonSdkOptions = {
    wssUrls: ['wss://websocket-proxy-2.prod.gke.acurast.com'],
    oracles: [
      '0x03149298e461df2e1087e5d08bb9ef6d5ce320c0926352d8cc5cb2c955dc178dac',
      '0x02fea43a222e374b36807d0a061531f5cb237b3260d64007b7025d80fbc8d1d0f8',
      '0x02ac3f2f3a8ee7c7b3666d2205d9f7056ac7d29999448b46a95dabce9a7fcedb0e',
      '0x02508d1c94d1ae31fbf1f66a308b392ac6c4bd58adceab80b6fe5306978f02147e',
      '0x02a2a801940eec2c2d37f8c98e544c211f00fb4bc07c25aafafb164d65396eacbb',
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
          from: 'USDT',
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
