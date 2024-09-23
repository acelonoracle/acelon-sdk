import { AcelonSdk } from '../src/index'
import { AcelonSdkOptions } from '../src/types'

async function testSDK() {
  const options: AcelonSdkOptions = {
    logging: true,
  }

  const acelonSdk = new AcelonSdk(options)

  try {
    const pings = await acelonSdk.ping()
    if (pings.length > 3) {
      const response = await fetch(
        `https://uptime.papers.tech/api/push/SFm8lW7pcN?status=up&msg=Alive Processors&ping=${pings.length}`,
        {
          method: 'GET',
        }
      )

      if (response.ok) {
        console.log('💚 Successfully sent heartbeat')
      } else {
        console.error('💔Failed to send heartbeat : ', response.statusText)
      }
    } else {
      console.error(
        `💔Failed to send heartbeat : ${pings.length}/3 oracles alive`
      )
    }
  } catch (error) {
    console.error(error)
  } finally {
    process.exit()
  }
}

testSDK()
