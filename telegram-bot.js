import TelegramBot from 'node-telegram-bot-api'

const token = '7097049447:AAHHufxTLKkgs15uLMXyiXTX_C-PJnfxdpk'
const chatId = '-4175958558'
const bot = new TelegramBot(token, { polling: true })

const sendTelegramMessage = message => {
  bot
    .sendMessage(chatId, message, {
      parse_mode: 'Markdown'
    })
    .then(() => console.log('Message sent successfully'))
    .catch(error => console.error('Error sending message:', error))
}

export default sendTelegramMessage
