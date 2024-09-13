# Acurast Oracle SDK

The Acurast Oracle SDK is a TypeScript library that provides a simple interface to interact with the Acurast Oracle Service. It allows developers to fetch price data for various cryptocurrency pairs, with signatures from multiple oracles.

## Features

- Fetch price data for multiple cryptocurrency pairs
- Verify price data across multiple oracles
- Check the health status of supported exchanges
- Support for different blockchain protocols (Substrate, EVM, WASM, Tezos)

## Installation

To install the Acurast Oracle SDK, use yarn:

```bash
yarn add acurast-oracle-service-sdk
```

## Usage

### Initializing the SDK

First, import and initialize the AcurastOracleSDK:

```typescript
import { AcurastOracleSDK } from "acurast-oracle-sdk"

const sdk = new AcurastOracleSDK({
  timeout: 5000, // (optional) default 10 seconds
  logging: true, // (optional) default false
  errorThreshold: 0.333, // (optional) default 0.333
})
```

### Fetching Price Data

To fetch price data for cryptocurrency pairs:

```typescript
const fetchPricesParams = {
  pairs: [
    { from: "BTC", to: "USDT" },
    { from: "ETH", to: "USDT" },
  ],
  protocol: "EVM",
  aggregation: "median",
}

try {
  const priceData = await sdk.getPrices(fetchPricesParams, 2) // Require 2 verifications
  console.log("Price data:", priceData)
} catch (error) {
  console.error("Error fetching prices:", error)
}
```

### Checking Exchange Health

To check the health status of supported exchanges:

```typescript
try {
  const exchanges = await sdk.getExchanges()
  console.log("Available exchanges:", exchanges)
} catch (error) {
  console.error("Error checking exchange health:", error)
}
```

### Closing the Connection

When you're done using the SDK, close the connection:

```typescript
await sdk.close()
```

## Response Examples

### getPrices Response

```typescript
;[
  {
    priceData: {
      from: "BTC",
      to: "USDT",
      decimals: 8,
      price: 5000000000000,
      timestamp: 1629300000000,
      sources: [
        { exchangeId: "BNC", certificate: "cert1" },
        { exchangeId: "CBP", certificate: "cert2" },
      ],
      requestHash: "0x1234567890abcdef",
    },
    packed: ["packed_data_1", "packed_data_2"],
    signatures: ["signature1", "signature2"],
    pubKeys: ["pubKey1", "pubKey2"],
  },
  {
    priceData: {
      from: "ETH",
      to: "USDT",
      decimals: 8,
      price: 300000000000,
      timestamp: 1629300000000,
      sources: [
        { exchangeId: "BNC", certificate: "cert1" },
        { exchangeId: "CBP", certificate: "cert2" },
      ],
      requestHash: "0x1234567890abcdef",
    },
    packed: ["packed_data_3", "packed_data_4"],
    signatures: ["signature3", "signature4"],
    pubKeys: ["pubKey1", "pubKey2"],
  },
]
```

### getExchanges Response

```typescript
;["BNC", "CBP", "BFX", "KRK", "GEM"]
```

## Description

### `AcurastOracleSDK`

#### Constructor

```typescript
constructor(options: AcurastOracleSDKOptions)
```

- `options.wssUrls`: (Optional) Array of WebSocket URLs to connect to the Acurast processors.
- `options.oracles`: (Optional) Array of processor public keys. These have to be public keys of processors that are running the AcurastOracleService. By default it will use the public keys from the AcurastOracleService.
- `options.timeout`: (Optional) Timeout in milliseconds for the requests. Default: 10 seconds.
- `options.logging`: (Optional) Enable or disable logs. Default: false.
- `options.errorThreshold`: (Optional) Value from 0 to 1 that determines the percentage of oracles that have to respond with the same error for it to be thrown by the sdk. Default: 0.333.

#### Methods

##### `getPrices(params: FetchPricesParams, verifications: number = 0): Promise<GetPricesResult[]>`

Fetches price data from the oracle network.

- `params`: The parameters for fetching prices. It includes:
  - `pairs`: Array of Pairs, Pairs to fetch prices for:
    - `from`: String, from symbol.
    - `to`: String, to symbol.
    - `decimals`: Number of decimals for the price.
    - `price`: (Optional) Price(s) to verify against the oracle price. (Provide a price per aggregatyion type requested)
    - `timestamp`: (Optional) Number, timestamp of the provided prices.
  - `protocol`: Protocol to package and sign the price data for.
  - `exchanges`: (Optional) List of exchange IDs to use as sources on the oracles. Default: all available exchanges.
  - `minSources`: (Optional) Minimum number of sources required. Default: 3.
  - `tradeAgeLimit`: (Optional) Maximum age of trade data in seconds. Default: 5 minutes.
  - `aggregation`: (Optional) Types of price aggregation requested from the oracles. Default: mean.
  - `maxSourcesDeviation`: (Optional) Maximum allowed standard deviation between prices in the sources. Default: no limit.
  - `maxValidationDiff`: (Optional) Maximum allowed price difference for validation against client. Default: 0.05%.
- `verifications`: The number of verifications required. Default: 0.

### getPrices Response

`GetPricesResult[]`
Each object contains the following properties:

1. `priceData`:

   - `from`: String - From symbol.
   - `to`: String - To symbol.
   - `decimals`: Number of decimals for the price.
   - `price`: Number or Number[] - Aggregated price(s).
   - `timestamp`: Number - Timestamp of the price data in ms.
   - `sources`: Array of Objects - Map exchangeID to the certificate for sources used.
     - `exchangeId`: String - The unique identifier of the exchange.
     - `certificate`: String - The API certificate.
   - `requestHash`: String - Hash of the original request parameters.

2. `packed`: String[] - Price data in the packed format for the chosen protocol.

3. `signatures`: String[] - Oracle signatures.

4. `pubKeys`: String[] - Oracle public keys.

##### `getExchanges(params?: CheckExchangeHealthParams, requiredResponses: number = 0): Promise<string[]>`

Retrieves a list of available exchanges.

- `params`: (Optional) The parameters for checking exchange health. It includes:
  - `exchanges`: (Optional) List of exchange IDs to check. Default: all available exchanges.
- `requiredResponses`: (Optional) The number of required responses from the oracles. Default: 0.

##### `close(): Promise<void>`

Closes the WebSocket connection.

#### Exchange ID table

| Exchange ID | Exchange Name |
| ----------- | ------------- |
| BNU         | Binance US    |
| BNC         | Binance       |
| CBP         | Coinbase      |
| BFX         | Bitfinex      |
| KRK         | Kraken        |
| BYB         | Bybit         |
| GEM         | Gemini        |
| KUC         | Kucoin        |
| GIO         | Gate IO       |
| CRY         | Crypto.com    |
| HTX         | HTX           |
| MEXC        | MEXC          |
| WBIT        | Whitebit      |
| OKX         | OKX           |
| UPB         | Upbit         |

## License

This project is licensed under the MIT License.
