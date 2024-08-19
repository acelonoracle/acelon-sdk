import { AcurastOracleSDK } from "../dist/index"
import { AcurastOracleSDKOptions, FetchPricesParams } from "../dist/types"

async function testSDK() {
  const options: AcurastOracleSDKOptions = {
    wssUrls: ["wss://websocket-proxy-1.prod.gke.acurast.com", "wss://websocket-proxy-2.prod.gke.acurast.com"],
    oracles: [
      "0x027ab24fbd4035567b879dd842f59e0b7241f11a23f5db241750b51b312ea0f5ed",
      "0x03292132b532986021a203a5417cd0034acbe1d7a40c5685eedb46be5efdf9bc32",
      "0x03c0acb2c511bdce95a5b799283b01baecc70f17bbc016765855d1cd45d9fb1572",
      "0x035cee1726225318bd901ca88e896251c1d63ad56c5c930774748840dff427d6d8",
      "0x0347b55c75ea5607defec964bf8b3adcf34dcee799c4ea075a382b23fdd2222078",
    ],
    logging: true,
  }
  const sdk = new AcurastOracleSDK(options)

  try {
    const priceParams: FetchPricesParams = {
      pairs: [{ from: "BTC", to: "USDT" }],
      protocol: "EVM",
      aggregation: "mean",
    }

    const prices = await sdk.getPrices(priceParams, 2)
    console.log("Prices:", prices)
  } catch (error) {
    console.error("Error:", error)
  }
}

testSDK()
