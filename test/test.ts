import { AcurastOracleSDK } from "../dist/index"
import { AcurastOracleSDKOptions, FetchPricesParams } from "../dist/types"

async function testSDK() {
  const options: AcurastOracleSDKOptions = {
    wssUrls: ["wss://websocket-proxy-1.prod.gke.acurast.com", "wss://websocket-proxy-2.prod.gke.acurast.com"],
    oracles: [
      "0x022c3216c278a0e3b74eac5d245bd54421e2e49be1c72cd2619a20c297a9acc5f1",
      "0x02ff81b36dbce74bca3ac6ff18ab52313a869347aa9d41d67c8239dea1e290bee4",
      "0x02376180ae8bed4b9f8b7c6015e16ced9b492aa19213e9c75bed6a5c07bb1e00cf",
      "0x0251a06befc6ba75e477a589547692b5b229551d4931fadde9a76451d8df900aa5",
      "0x0230dd1febda2182b2b374261c7fcea9750feb5c7ea6a6eebea93fd07106b5eb92",
    ],
    logging: true,
  }
  const sdk = new AcurastOracleSDK(options)

  try {
    const priceParams1: FetchPricesParams = {
      pairs: [{ from: "PEPE", to: "USDT", decimals: 12 }],
      protocol: "EVM" as any,
    }

    const priceParams2: FetchPricesParams = {
      pairs: [{ from: "SOL", to: "USDT" }],
      protocol: "Tezos",
    }

    const prices = await sdk.getPrices(priceParams1, 2)
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
