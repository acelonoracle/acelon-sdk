import { AcurastOracleSDK } from '../dist/index'
import { AcurastOracleSDKOptions, FetchPricesParams } from '../dist/types'

async function testSDK() {
  const options: AcurastOracleSDKOptions = {
    errorThreshold: 0.333,
    logging: true,
  }

  const acurastOracleSdk = new AcurastOracleSDK(options)

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

    const prices = await acurastOracleSdk.getPrices(params, 2)

    console.log('Prices:', JSON.stringify(prices, null, 2))
  } catch (error) {
    console.error('Error:', error)
  }
}

testSDK()
