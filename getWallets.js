import fs from 'fs'
import path from 'path'

const jsonFolder = './wallets'
const outputFile = 'wallets.json'

let addresses = []

const main = async () => {
  const files = fs.readdirSync(jsonFolder)

  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = path.join(jsonFolder, file)
      const data = fs.readFileSync(filePath, 'utf-8')
      const wallets = JSON.parse(data)

      wallets.forEach(w => {
        if (w.address) {
          addresses.push(w.address)
        }
      })
    }
  }

  fs.writeFile(outputFile, JSON.stringify(addresses, null, 2), err => {
    if (err) {
      console.error('Error writing output file:', err)
      return
    }
    console.log('Successfully merged addresses into', outputFile)
  })
}

main()
