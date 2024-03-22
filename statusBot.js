import TelegramBot from 'node-telegram-bot-api'
import axios from 'axios'
import fs from 'fs'

const INUX_ADRESS = 'cosmosvaloper1zgqal5almcs35eftsgtmls3ahakej6jmnn2wfj'
const token = '6947889103:AAF7erOM8S-Zr5f-MXLJWXy3NRwzFoUH3Tg'
const bot = new TelegramBot(token, { polling: true })

const readFile = async fileName => {
  try {
    const fileContent = await fs.promises.readFile(`wallets/${fileName}.json`)
    const data = JSON.parse(fileContent)
    return data
  } catch (error) {
    console.error('Error reading file:', error)
    return []
  }
}

const getBalance = async wallets => {
  try {
    let totalUatomBalance = 0

    const balancePromises = wallets.map(async ({ address }) => {
      const response = await axios.get(
        `https://lcd-cosmoshub.keplr.app/cosmos/bank/v1beta1/balances/${address}`
      )
      const { balances } = response.data
      const uatomBalance = balances.find(balance => balance.denom === 'uatom')
      return parseFloat(uatomBalance.amount)
    })

    const uatomBalances = await Promise.all(balancePromises)

    totalUatomBalance = uatomBalances.reduce(
      (total, balance) => total + balance,
      0
    )

    return totalUatomBalance
  } catch (error) {
    console.error('Error fetching balance:', error)
    return 0
  }
}

const getStakingBalances = async wallets => {
  try {
    const stakingAmounts = {}

    const stakingPromises = wallets.map(async ({ address }) => {
      const response = await axios.get(
        `https://lcd-cosmoshub.keplr.app/cosmos/staking/v1beta1/delegations/${address}?pagination.limit=1000`
      )
      const delegationResponses = response.data.delegation_responses

      delegationResponses.forEach(({ delegation, balance }) => {
        const { validator_address: validatorAddress } = delegation
        const stakingAmount = parseFloat(balance.amount)

        if (stakingAmount > 0) {
          if (stakingAmounts[validatorAddress]) {
            stakingAmounts[validatorAddress] += stakingAmount
          } else {
            stakingAmounts[validatorAddress] = stakingAmount
          }
        }
      })
    })

    await Promise.all(stakingPromises)
    return stakingAmounts
  } catch (error) {
    console.error('Error fetching staking balance:', error)
    return {}
  }
}

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
    console.log('/balances')
    bot.sendMessage(chatId, 'CHỌN DEV:', options)
  })

  bot.on('callback_query', async callbackQuery => {
    const { message, data } = callbackQuery

    try {
      const loadingMessage = await bot.sendMessage(
        message.chat.id,
        '⌛️ Calculating balances...',
        {
          parse_mode: 'Markdown'
        }
      )

      const fileName = data
      const wallets = await readFile(fileName)

      const totalUatomBalance = await getBalance(wallets)
      let totalStakingBalance = await getStakingBalances(wallets)

      let text = `*--- ${fileName.toUpperCase()} ---*\n\n`

      text += `Total wallets: ${wallets.length}\n\n`
      text += `Total balance: ${totalUatomBalance / 1_000_000} ATOM\n\n`

      text += 'Total staking amount on each validator:\n\n'
      Object.entries(totalStakingBalance).forEach(
        ([validatorAddress, amount]) => {
          const validatorMintscanLink = `https://www.mintscan.io/cosmos/validators/${validatorAddress}`
          const atomAmount = amount / 1_000_000

          if (validatorAddress === INUX_ADRESS) {
            text += `- Validator: [Inu X](${validatorMintscanLink}), Amount: ${atomAmount} ATOM\n`
          } else {
            text += `- Validator: [${shortenValidatorAddress(
              validatorAddress
            )}](${validatorMintscanLink}), Amount: ${atomAmount}\n`
          }
        }
      )

      console.log(text)

      await bot.editMessageText(text, {
        chat_id: message.chat.id,
        message_id: loadingMessage.message_id,
        parse_mode: 'Markdown'
      })
    } catch (error) {
      console.error('Error processing callback query:', error)
    }
  })

  bot.on('polling_error', error => {
    console.error(error)
  })

  console.log('Bot is running...')
}

const shortenValidatorAddress = address => {
  return (
    address.substring(0, 10) + '...' + address.substring(address.length - 5)
  )
}

createBot()
