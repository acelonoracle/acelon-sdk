import { AcurastOracleSDK } from "../dist/index"
import { AcurastOracleSDKOptions, FetchPricesParams } from "../dist/types"

async function testSDK() {
  const options: AcurastOracleSDKOptions = {
    wssUrls: ["wss://websocket-proxy-1.prod.gke.acurast.com", "wss://websocket-proxy-2.prod.gke.acurast.com"],
    oracles: [
      "0x033e0a6bcc12fd3e8d0fd95eed690adafbfb4920a846a178f024cc92758b60409d",
      "0x0254803abdff960ffaea5b23fb1a246874985e146b216945637b7b9582604c56a1",
      "0x036fe65107e5c86508d5aab23f1fa2727e0a5f1196ce796ba0866f3ede3c724af8",
      "0x0376eb8659621201f3505ae66dd325b52f2b4114b071f9411bff16dfa6c899e6bc",
      "0x037fb9f66de653ae6156c4dc9fb0dfbcd5fb9f4e84c2980d00a6f666536ad036fa",
    ],
    logging: true,
  }
  const sdk = new AcurastOracleSDK(options)

  try {
    const priceParams: FetchPricesParams = {
      pairs: [{ from: "BTC", to: "null" }],
      protocol: "EVM",
      aggregation: ["mean", "min", "max"],
    }

    const prices = await sdk.getPrices(priceParams, 2)
    console.log("Prices:", prices[0].priceData.price, prices)
  } catch (error) {
    console.error("Error:", error)
  }
}

testSDK()
