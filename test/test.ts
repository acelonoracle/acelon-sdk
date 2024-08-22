import { AcurastOracleSDK } from "../dist/index"
import { AcurastOracleSDKOptions, FetchPricesParams } from "../dist/types"

async function testSDK() {
  const options: AcurastOracleSDKOptions = {
    wssUrls: ["wss://websocket-proxy-1.prod.gke.acurast.com", "wss://websocket-proxy-2.prod.gke.acurast.com"],
    oracles: [
      "0x02696d6b3a93a0888490f00faacb9080f170e850ce59eae3f9cbb1cf11e3b05c16",
      "0x038a8ac78dfcaa925a4119d0a88e70e1d4d7b8c2f8973a692fa137604093c00144",
      "0x03e09f94727687ee139dff49ea46ba181f5cc335febbf5caf3d7568187e224530f",
      "0x03eb026b19046bd09fb5fa0e3b335567efcc43dd98de9d8c00d6789dfe4a38d658",
      "0x03d14b97145d62f1aa9f867ee1edb947725e25fdb5bc11d31e335b3fe20b60b16c",
    ],
    logging: true,
  }
  const sdk = new AcurastOracleSDK(options)

  try {
    const priceParams1: FetchPricesParams = {
      pairs: [{ from: "PEPE", to: "USDT", precision: 8 }],
      protocol: "EVM" as any,
      exchanges: ["binance", "kucoin"],
      minSources: 3,
    }

    const priceParams2: FetchPricesParams = {
      pairs: [{ from: "SOL", to: "USDT" }],
      protocol: "Tezos",
    }

    const prices = await sdk.getPrices(priceParams1, 3)
    // const prices = await Promise.all([sdk.getPrices(priceParams1, 3), sdk.getPrices(priceParams2, 3)])
    console.log("Prices:", JSON.stringify(prices, null, 2))
  } catch (error) {
    console.error("Error:", error)
  }

  try {
    const exchanges = await sdk.getExchanges()
    console.log("Exchanges:", exchanges)
  } catch (error) {
    console.error("Error:", error)
  }
}

testSDK()
