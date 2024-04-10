import { toHex, fromBech32, toBech32, fromHex } from '@cosmjs/encoding'
import fs from 'fs'

const convertwallet = async () => {
  const jsonData = fs.readFileSync('./wallets.json')
  const data = JSON.parse(jsonData)
  const listStarsWallet = []
  for (let index = 0; index < data.length; index++) {
    const cosmosWallet = data[index]
    const hex = toHex(fromBech32(cosmosWallet).data)
    const starsWallet = toBech32('stars', fromHex(hex))
    listStarsWallet.push(starsWallet)
  }
  fs.writeFileSync(
    './wallets-stars.json',
    JSON.stringify(listStarsWallet, null, 2)
  )

  console.log('Done!')
}

convertwallet()
