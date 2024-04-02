import fs from 'fs'

export const readFile = async filePath => {
  try {
    const fileContent = await fs.promises.readFile(filePath)
    const data = JSON.parse(fileContent)
    return data
  } catch (error) {
    console.error('Error reading file:', error)
    return []
  }
}

export const getUserAddressFromFiles = async (filePath, walletAddress) => {
  try {
    const files = fs.readdirSync(filePath)

    for (const file of files) {
      const wallets = await readFile(`${filePath}/${file}`)

      for (const wallet of wallets) {
        if (wallet.address === walletAddress) {
          return { walletInfo: wallet, fileName: file }
        }
      }
    }

    return { walletInfo: null, fileName: null }
  } catch (error) {
    console.error('Error reading wallet files:', error)
    return { walletInfo: null, fileName: null }
  }
}

export const shortenAddress = address => {
  return (
    address.substring(0, 10) + '...' + address.substring(address.length - 5)
  )
}

export const readAllowedUsernames = () => {
  try {
    const content = fs.readFileSync('../users.json', 'utf8')
    const usernames = JSON.parse(content)
    return usernames
  } catch (error) {
    console.error('Lỗi khi đọc tệp JSON:', error)
    return []
  }
}
