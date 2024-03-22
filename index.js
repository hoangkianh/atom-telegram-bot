import TelegramBot from 'node-telegram-bot-api'
import { Command } from 'commander'
import { trackWallet } from './walletTracker.js'

const token = '7097049447:AAHHufxTLKkgs15uLMXyiXTX_C-PJnfxdpk'
const chatId = '-4175958558'

export const bot = new TelegramBot(token, { polling: true })
const program = new Command()
program.option('-n, --name <fileName>', 'Specify the name of the config file')
program.parse()

if (!program.opts().name) {
  console.error(
    'Please specify the name of the config file using --name option'
  )
  process.exit(1)
}

const fileName = `${program.opts().name}.json`

// Crawl data
setInterval(() => {
  //   callAPIsForAllFiles()
  trackWallet(fileName, bot, chatId)
}, 10000)
