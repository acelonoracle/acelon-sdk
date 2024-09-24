import { AcelonSdk } from '../dist/index'
import { AcelonSdkOptions, FetchPricesParams } from '../dist/types'

async function testSDK() {
  const options: AcelonSdkOptions = {
    oracles: [
      '0x0291a83db9cbf2a4a52c9c87cf41951296a1dad191a9bd878482490ff07320d0a8',
      '0x03572af886cd6d0b79d6be79aad891e4c774502bf87044d623708045b6e6e81c09',
      '0x0340c21bd552585cbf1226de8a5abe4632584c4a14ee7529f6c1283ca6b2003d59',
      '0x0290a29305ffcbc549344742b305b5900f855823d42ce41c57cebf3b972dccad46',
      '0x0204452f576895bade73a4b104472f6763263032c2853ae60b6345789610395f34',
      '0x0204452f576895bade73a4b104472f6763263032c2853ae60b6345789610395f31',
    ],
    wssUrls: [
      'wss://websocket-proxy-1.prod.gke.acurast.com',
      'wss://websocket-proxy-2.prod.gke.acurast.com',
    ],
    errorThreshold: 0.333,
    logging: true,
  }

  const acelonSdk = new AcelonSdk(options)

  // const ping = await acelonSdk.ping()
  // console.log('Ping:', ping)

  try {
    const params: FetchPricesParams = {
      pairs: [
        {
          from: 'SOL',
          to: 'USDT',
          decimals: 9,
        },
      ],
      protocol: 'EVM',
      aggregation: ['median'],
    }

    const prices = await acelonSdk.getPrices(params, 2)

    console.log('Prices:', JSON.stringify(prices, null, 2))
  } catch (error) {
    console.error('Error:', error)
  }
}

testSDK()
