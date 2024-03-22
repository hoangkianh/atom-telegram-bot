import TelegramBot from 'node-telegram-bot-api'

const token = '6947889103:AAF7erOM8S-Zr5f-MXLJWXy3NRwzFoUH3Tg'
const bot = new TelegramBot(token, { polling: true })

const createBot = () => {
  bot.onText(/\/balances/, async msg => {
    const chatId = msg.chat.id

    const options = {
      reply_markup: JSON.stringify({
        inline_keyboard: [
          [
            { text: 'Dev Mỹ', callback_data: 'my' },
            { text: 'Dev Dương', callback_data: 'dpa' }
          ],
          [
            { text: 'Dev HKA', callback_data: 'hka' },
            { text: 'Peo', callback_data: 'peo' }
          ],
          [
            { text: 'Thảo', callback_data: 'thao' },
            { text: 'on-chain master', callback_data: 'vu' }
          ],
          [
            { text: 'Dev Nam', callback_data: 'nam' },
            { text: 'Tùng', callback_data: 'tung' }
          ],
          [
            { text: 'Phượng', callback_data: 'phuong' },
            { text: 'Sugar Baby', callback_data: 'sugar' }
          ],
          [
            { text: 'Bee', callback_data: 'bee' },
            { text: 'Tòng', callback_data: 'tong' }
          ],
          [
            { text: 'Chenin', callback_data: 'chenin' },
            { text: 'Vương', callback_data: 'vuong' }
          ],
          [{ text: 'All', callback_data: 'all' }]
        ]
      })
    }

    bot.sendMessage(chatId, 'CHỌN DEV:', options)
  })

  bot.on('callback_query', callbackQuery => {
    const chatId = callbackQuery.message.chat.id
    const data = callbackQuery.data

    switch (data) {
      case 'all':
        break
      case 'my':
        break
      case 'dpa':
        break
      case 'hka':
        break
      case 'peo':
        break
      case 'thao':
        break
      case 'vu':
        break
      case 'nam':
        break
      case 'tung':
        break
      case 'phuong':
        break
      case 'sugar':
        break
      case 'bee':
        break
      case 'tong':
        break
      case 'chenin':
        break
      case 'vuong':
        break
      default:
        break
    }
  })

  bot.on('polling_error', error => {
    console.error(error)
  })

  console.log('Bot is running...')
}

createBot()
