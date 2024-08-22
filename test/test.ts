import { AcurastOracleSDK } from "../dist/index"
import { AcurastOracleSDKOptions, FetchPricesParams } from "../dist/types"

async function testSDK() {
  const options: AcurastOracleSDKOptions = {
    wssUrls: ["wss://websocket-proxy-1.prod.gke.acurast.com", "wss://websocket-proxy-2.prod.gke.acurast.com"],
    oracles: [
      "0x02bce6d10f4e63ef1ee9ba391c4ab495bb71b2f519d977a2e1a61f4976050debe7",
      "0x038d8b64652b49afc3b7708691663bb2fad2e47cd9117ee2ec6fdf8734d09b67c2",
      "0x02964a08d6e25c242f506a6262be2cd56765a22cc72c6baf1ed3992bcf02540ccb",
      "0x03d99b4f665d5c2bb3c5497016836a54e3acf7113290f6bab35f0f829c4f7cea4a",
    ],
    logging: true,
  }
  const sdk = new AcurastOracleSDK(options)

  try {
    const priceParams1: FetchPricesParams = {
      pairs: [{ from: "PEPE", to: "USDT", decimals: 6 }],
      protocol: "EVM" as any,
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
