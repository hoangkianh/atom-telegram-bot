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

const shortenValidatorAddress = address => {
  return (
    address.substring(0, 10) + '...' + address.substring(address.length - 5)
  )
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

const getTotalTxs = async wallets => {
  try {
    let totalTxs = 0

    const txsPromises = wallets.map(async ({ hex }) => {
      const response = await axios.get(
        `https://api-indexer.keplr.app/v1/history/${hex}?limit=10000&offset=-15&chains=cosmoshub`
      )
      const { count } = response.data[0]
      return count
    })

    const txsCounts = await Promise.all(txsPromises)

    totalTxs = txsCounts.reduce((total, txs) => total + txs, 0)

    return totalTxs
  } catch (error) {
    console.error('Error fetching txs:', error)
    return 0
  }
}

const getTextMessage = async (
  fileName,
  totalWallets,
  totalTxs,
  totalUatomBalance,
  totalStakingBalances
) => {
  let totalStaking = 0
  let text = `*--- ${fileName.toUpperCase()} ---*\n\n`

  text += `1️⃣ Total wallets: ${totalWallets}\n\n`
  text += `2️⃣ Total transactions: ${totalTxs}\n\n`
  text += `3️⃣ Total balance: ${totalUatomBalance / 1_000_000} ATOM\n\n`

  text += '4️⃣ Total staking amount on each validator:\n\n'
  Object.entries(totalStakingBalances).forEach(([validatorAddress, amount]) => {
    const validatorMintscanLink = `https://www.mintscan.io/cosmos/validators/${validatorAddress}`
    const atomAmount = amount / 1_000_000
    totalStaking += amount

    if (validatorAddress === INUX_ADRESS) {
      text += `- Validator: [Inu X](${validatorMintscanLink}), Amount: ${atomAmount} ATOM\n`
    } else {
      text += `- Validator: [${shortenValidatorAddress(
        validatorAddress
      )}](${validatorMintscanLink}), Amount: ${atomAmount}\n`
    }

    text += `\n⚛️ Total ATOM: ${
      (totalUatomBalance + totalStaking) / 1_000_000
    } ATOM`
  })

  return text
}

const createBot = () => {
  bot.onText(/\/status/, async msg => {
    const chatId = msg.chat.id

    const options = {
      reply_markup: JSON.stringify({
        inline_keyboard: [
          [{ text: '👩‍👩‍👧‍👧 Tất cả', callback_data: 'all' }],
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
          [{ text: '❌ Close', callback_data: 'close' }]
        ]
      })
    }
    console.log('/status')
    bot.sendMessage(chatId, 'CHỌN DEV:', options)
  })

  bot.on('callback_query', async callbackQuery => {
    const { message, data } = callbackQuery

    if (data === 'close') {
      try {
        await bot.deleteMessage(message.chat.id, message.message_id)
        return
      } catch (error) {
        console.error('Error deleting message:', error)
      }
    }

    try {
      const loadingMessage = await bot.sendMessage(
        message.chat.id,
        '⌛️ ⌛️ Loading...',
        {
          parse_mode: 'Markdown'
        }
      )

      let text = ''
      const fileName = data

      if (fileName === 'all') {
        const files = fs.readdirSync('wallets')

        let totalWallets = 0
        let totalTxs = 0
        let totalBalance = 0
        const totalStaking = {}

        for (const file of files) {
          const wallets = await readFile(file.replace('.json', ''))

          totalWallets += wallets.length
          totalTxs += await getTotalTxs(wallets)
          totalBalance += await getBalance(wallets)

          const totalStakingBalances = await getStakingBalances(wallets)

          for (const [validator, staking] of Object.entries(
            totalStakingBalances
          )) {
            totalStaking[validator] = (totalStaking[validator] || 0) + staking
          }
        }

        text = await getTextMessage(
          'all',
          totalWallets,
          totalTxs,
          totalBalance,
          totalStaking
        )
      } else {
        const wallets = await readFile(fileName)
        const totalTxs = await getTotalTxs(wallets)
        const totalUatomBalance = await getBalance(wallets)
        const totalStakingBalance = await getStakingBalances(wallets)
        text = await getTextMessage(
          fileName,
          wallets.length,
          totalTxs,
          totalUatomBalance,
          totalStakingBalance
        )
      }

      console.log(text)

      await bot.editMessageText(text, {
        chat_id: message.chat.id,
        message_id: loadingMessage.message_id,
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[{ text: '❌ Close', callback_data: 'close' }]]
        }
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
createBot()
