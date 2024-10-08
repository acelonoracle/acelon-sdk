import { AcelonSdk } from '../dist/index'
import { AcelonSdkOptions, FetchPricesParams } from '../dist/types'

async function testSDK() {
  const options: AcelonSdkOptions = {
    // wssUrls: ['wss://websocket-proxy-1.prod.gke.acurast.com'],
    oracles: [
      '0x0225b5ac28edf331ec4531cafe8070fade131af0a2a44ac8e43fff57248f07e1b6',
      '0x02aef8d62b33b0f3f7c55fcf726d771a6a7eef0c6feabe1258b4fa61377a57ad82',
      '0x025d53c141fa9d25efd4ef6b6647bd83abd4410699281f7a7ca920c71ce77d5b96',
      '0x02d3c2672421af8c792a86b276af0d9c32164d79dae7f45edf1ce0f318a89c3e9b',
      '0x03bf54fcf2805569bf6916ea6f37e432d50dbd216159e64e447aa19c61b08e9d72',
      '0x02f856ca86bb3cc2f64b2e757b8115bdbc3a3bb6d77f5d3c8e915fd759685f5b04',
      '0x0246edb192c75b3b4590aeba728b6518692b67a1564fd10c37e1b7f459f99b8570',
      '0x030bc45bb620efc03969ea7b96ddda5d36895e6b8f23620b81eda8f1c3f768080f',
      '0x0337928b11e5af8b83239e9b5dc8b6d6880b1dc723c522e71b2db3bee295b710c4',
      '0x02b507a7455f3f83807c8b98be3e5de2ef4c9ce306b5787c4b2970b78388440ba0',
    ],
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
      protocol: 'EVM',
      aggregation: ['median'],
      minSources: 3,
      maxValidationDiff: 1
    }

    const prices = await acelonSdk.getPrices(params, 2)

    console.log('Prices:', JSON.stringify(prices, null, 2))
  } catch (error) {
    console.error('Error:', error)
  }
}

testSDK()
