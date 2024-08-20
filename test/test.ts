import { AcurastOracleSDK } from "../dist/index"
import { AcurastOracleSDKOptions, FetchPricesParams } from "../dist/types"

async function testSDK() {
  const options: AcurastOracleSDKOptions = {
    wssUrls: ["wss://websocket-proxy-1.prod.gke.acurast.com", "wss://websocket-proxy-2.prod.gke.acurast.com"],
    oracles: [
      "0x02e5adb04aeb21fd1fa946ef63e95964674942bf42365617370b99d975881069be",
      "0x0314b2f506a05b211099a25afc438c0c3fa31f03df4f53f45377786a088da53b39",
      "0x03e2a30f7270a662fcc6b99c74417410eb41750e81af3fc754b107ca6146a9a7a4",
      "0x02e83c7e865b814771f37c5cd8e811901001469e0b28a05ed8b712b51b5f827e66",
      "0x02aa4d27b9fc023612fe902ca90896a125fd1be08992c3927197b1be876e90078c",
    ],
    logging: true,
  }
  const sdk = new AcurastOracleSDK(options)

  try {
    const priceParams: FetchPricesParams = {
      pairs: [{ from: "BTC", to: "USDT" }],
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
