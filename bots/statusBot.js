import TelegramBot from 'node-telegram-bot-api'
import axios from 'axios'
import fs from 'fs'
import {
  readFile,
  getUserAddressFromFiles,
  shortenAddress,
  readAllowedUsernames
} from '../utils.js'

const INUX_ADRESS = 'cosmosvaloper1zgqal5almcs35eftsgtmls3ahakej6jmnn2wfj'
const token = '6947889103:AAF7erOM8S-Zr5f-MXLJWXy3NRwzFoUH3Tg'
const bot = new TelegramBot(token, {
  polling: true,
  request: {
    agentOptions: {
      keepAlive: true,
      family: 4
    }
  }
})

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

const getUnstakedINUXBalances = async wallets => {
  try {
    const stakingInfo = {}

    const stakingPromises = wallets.map(async ({ address }) => {
      const response = await axios.get(
        `https://lcd-cosmoshub.keplr.app/cosmos/staking/v1beta1/delegations/${address}?pagination.limit=1000`
      )
      const delegationResponses = response.data.delegation_responses

      delegationResponses.forEach(({ delegation, balance }) => {
        const { validator_address: validatorAddress } = delegation
        const stakingAmount = parseFloat(balance.amount)

        if (validatorAddress !== INUX_ADRESS && stakingAmount > 0) {
          if (stakingInfo[validatorAddress]) {
            stakingInfo[validatorAddress].push({ address, stakingAmount })
          } else {
            stakingInfo[validatorAddress] = [{ address, stakingAmount }]
          }
        }
      })
    })

    await Promise.all(stakingPromises)

    return stakingInfo
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

  if (totalWallets > 1) {
    text += `1️⃣ Total wallets: ${totalWallets}\n\n`
  }
  text += `${
    totalWallets > 1 ? '2️⃣' : '1️⃣'
  } Total transactions: ${totalTxs}\n\n`
  text += `${totalWallets > 1 ? '3️⃣' : '2️⃣'} Total balance: ${
    totalUatomBalance / 1_000_000
  } ATOM\n\n`

  text += `${
    totalWallets > 1 ? '4️⃣' : '3️⃣'
  }  Total staking amount on each validator:\n\n`
  Object.entries(totalStakingBalances).forEach(([validatorAddress, amount]) => {
    const validatorMintscanLink = `https://www.mintscan.io/cosmos/validators/${validatorAddress}`
    const atomAmount = amount / 1_000_000
    totalStaking += amount

    if (validatorAddress === INUX_ADRESS) {
      text += `- Validator: [Inu X](${validatorMintscanLink}), Amount: ${atomAmount} ATOM\n`
    } else {
      text += `- Validator: [${shortenAddress(
        validatorAddress
      )}](${validatorMintscanLink}), Amount: ${atomAmount} ATOM\n`
    }
  })

  text += `\n⚛️ Total ATOM: ${
    (totalUatomBalance + totalStaking) / 1_000_000
  } ATOM`

  return text
}

const getStatus = async (chatId, data) => {
  try {
    const loadingMessage = await bot.sendMessage(chatId, '⌛️ Loading...', {
      reply_markup: {
        inline_keyboard: [[{ text: '❌ Close', callback_data: 'close' }]]
      }
    })

    let text = ''
    const fileName = data

    if (fileName === 'all') {
      const files = fs.readdirSync('../wallets')

      let totalWallets = 0
      let totalTxs = 0
      let totalBalance = 0
      let index = 0
      const totalStaking = {}

      for (const file of files) {
        const wallets = await readFile(`../wallets/${file}`)
        await bot.editMessageText(
          `⌛️ Loading ${file.replace('.json', '').toUpperCase()} (${
            index + 1
          }/${files.length})...`,
          {
            chat_id: chatId,
            message_id: loadingMessage.message_id,
            parse_mode: 'Markdown'
          }
        )

        totalWallets += wallets.length
        totalTxs += await getTotalTxs(wallets)
        totalBalance += await getBalance(wallets)

        const totalStakingBalances = await getStakingBalances(wallets)

        for (const [validator, staking] of Object.entries(
          totalStakingBalances
        )) {
          totalStaking[validator] = (totalStaking[validator] || 0) + staking
        }

        index++
      }

      text = await getTextMessage(
        'all',
        totalWallets,
        totalTxs,
        totalBalance,
        totalStaking
      )
    } else {
      const wallets = await readFile(`../wallets/${fileName}.json`)
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
      chat_id: chatId,
      message_id: loadingMessage.message_id,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '❌ Close', callback_data: 'close' }]]
      }
    })
  } catch (error) {
    console.error('Error processing callback query:', error)
    await bot.sendMessage(
      chatId,
      'Error processing command. Please try again later.',
      {
        reply_markup: {
          inline_keyboard: [[{ text: '❌ Close', callback_data: 'close' }]]
        }
      }
    )
  }
}

const getUnstakedWallets = async (chatId, data) => {
  try {
    const loadingMessage = await bot.sendMessage(chatId, '⌛️ Loading...', {
      reply_markup: {
        inline_keyboard: [[{ text: '❌ Close', callback_data: 'close' }]]
      }
    })

    const fileName = data

    const wallets = await readFile(`../wallets/${fileName}.json`)
    const stakingInfo = await getUnstakedINUXBalances(wallets)
    let text = '📊 Unstaked INUX Balances:\n\n'
    if (Object.keys(stakingInfo).length === 0) {
      text += 'No unstaked balances found.'
    } else {
      for (const [validatorAddress, stakeDetails] of Object.entries(
        stakingInfo
      )) {
        const validatorMintscanLink = `https://www.mintscan.io/cosmos/validators/${validatorAddress}`
        text += `🖥️ Validator: [${shortenAddress(
          validatorAddress
        )}](${validatorMintscanLink})\n`
        stakeDetails.forEach(({ address, stakingAmount }) => {
          const wallet = wallets.find(w => w.address === address)
          const walletName = wallet
            ? `${fileName.toUpperCase()}-${wallet.name}`
            : shortenAddress(address)
          const walletMintscanLink = `https://www.mintscan.io/cosmos/address/${address}`
          text += `- Wallet: [${walletName}](${walletMintscanLink}), Staking Amount: ${
            stakingAmount / 1_000_000
          } ATOM\n`
        })
        text += '\n'
      }
    }

    console.log(text)

    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: loadingMessage.message_id,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '❌ Close', callback_data: 'close' }]]
      }
    })
  } catch (error) {
    console.error('Error processing callback query:', error)
    await bot.sendMessage(
      chatId,
      'Error processing command. Please try again later.',
      {
        reply_markup: {
          inline_keyboard: [[{ text: '❌ Close', callback_data: 'close' }]]
        }
      }
    )
  }
}

const getWardenAirdrop = async (chatId, data) => {
  const callAPI = async wallets => {
    const wardPromises = wallets.map(async ({ address }) => {
      const response = await axios.get(
        `https://airdrop-api.wardenprotocol.org/api/wallets/${address}/airdrop`
      )
      const value = Number(response.data.value)
      return Number.isNaN(value) ? 0 : value
    })

    const wardValues = await Promise.all(wardPromises)
    const totalWarden = wardValues.reduce(
      (total, value) => total + Number(value),
      0
    )

    return totalWarden
  }

  try {
    const loadingMessage = await bot.sendMessage(chatId, '⌛️ Loading...', {
      reply_markup: {
        inline_keyboard: [[{ text: '❌ Close', callback_data: 'close' }]]
      }
    })

    const fileName = data
    let text = ''
    let totalWarden = 0

    if (fileName === 'all') {
      const files = fs.readdirSync('../wallets')

      let index = 0

      for (const file of files) {
        const wallets = await readFile(`../wallets/${file}`)
        await bot.editMessageText(
          `⌛️ Loading ${file.replace('.json', '').toUpperCase()} (${
            index + 1
          }/${files.length})...`,
          {
            chat_id: chatId,
            message_id: loadingMessage.message_id,
            parse_mode: 'Markdown'
          }
        )

        totalWarden += await callAPI(wallets)
        index++
      }
    } else {
      const wallets = await readFile(`../wallets/${fileName}.json`)
      totalWarden = await callAPI(wallets)
    }
    text = `📊 Total WARD Balances: ${totalWarden}`
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: loadingMessage.message_id,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '❌ Close', callback_data: 'close' }]]
      }
    })
  } catch (error) {
    console.error('Error processing callback query:', error)
    await bot.sendMessage(
      chatId,
      'Error processing command. Please try again later.',
      {
        reply_markup: {
          inline_keyboard: [[{ text: '❌ Close', callback_data: 'close' }]]
        }
      }
    )
  }
}

const getHavaAirdrop = async (chatId, data) => {
  let totalOptInWallets = 0
  let nonOptInWallets = []

  const callAPI = async wallets => {
    const promises = wallets.map(async ({ address }) => {
      const response = await axios.get(
        `https://havacoin.xyz/api/v2/balances?cosmos=${address}`
      )
      const { total } = response.data
      if (Number.isNaN(total)) {
        nonOptInWallets.push(address)
        return 0
      } else {
        totalOptInWallets++
        return total
      }
    })
    const havaValues = await Promise.all(promises)
    const totalHava = havaValues.reduce(
      (total, value) => total + Number(value),
      0
    )

    return totalHava
  }

  try {
    const loadingMessage = await bot.sendMessage(chatId, '⌛️ Loading...', {
      reply_markup: {
        inline_keyboard: [[{ text: '❌ Close', callback_data: 'close' }]]
      }
    })

    const fileName = data
    let text = ''
    let totalHava = 0
    let wallets = []

    if (fileName === 'all') {
      const files = fs.readdirSync('../wallets')

      let index = 0

      for (const file of files) {
        wallets = await readFile(`../wallets/${file}`)
        await bot.editMessageText(
          `⌛️ Loading ${file.replace('.json', '').toUpperCase()} (${
            index + 1
          }/${files.length})...`,
          {
            chat_id: chatId,
            message_id: loadingMessage.message_id,
            parse_mode: 'Markdown'
          }
        )

        totalHava += await callAPI(wallets)
        index++
      }
    } else {
      wallets = await readFile(`../wallets/${fileName}.json`)
      totalHava = await callAPI(wallets)
    }
    text = `📊 Total HAVA Balances: ${totalHava}`
    text += `\nTotal wallets opted-in: ${totalOptInWallets}`
    text += `\nTotal wallets non opted-in: ${nonOptInWallets.length}`
    nonOptInWallets.forEach(address => {
      const wallet = wallets.find(w => w.address === address)
      const walletName = wallet
        ? `${fileName.toUpperCase()}-${wallet.name}`
        : shortenAddress(address)
      const walletMintscanLink = `https://www.mintscan.io/cosmos/address/${address}`
      text += `- Wallet: [${walletName}](${walletMintscanLink})\n`
    })

    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: loadingMessage.message_id,
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{ text: '❌ Close', callback_data: 'close' }]]
      }
    })
  } catch (error) {
    console.error('Error processing callback query:', error)
    await bot.sendMessage(
      chatId,
      'Error processing command. Please try again later.',
      {
        reply_markup: {
          inline_keyboard: [[{ text: '❌ Close', callback_data: 'close' }]]
        }
      }
    )
  }
}

const createBot = () => {
  bot.onText(/\/status/, async msg => {
    const chatId = msg.chat.id
    const allowedUsernames = readAllowedUsernames()
    const isAllowedUser = allowedUsernames.includes(msg.chat.username)

    if (!isAllowedUser) {
      await bot.sendMessage(
        msg.chat.id,
        'You are not authorized to use this command.'
      )
      console.log(
        `${msg.chat.username} You are not authorized to use this command.`
      )
      return
    }

    const options = {
      reply_markup: JSON.stringify({
        inline_keyboard: [
          [{ text: '👩‍👩‍👧‍👧 Tất cả', callback_data: 'status-all' }],
          [
            { text: 'Dev Mỹ', callback_data: 'status-my' },
            { text: 'Dev Dương', callback_data: 'status-dpa' }
          ],
          [
            { text: 'Dev HKA', callback_data: 'status-hka' },
            { text: 'Peo', callback_data: 'status-peo' }
          ],
          [
            { text: 'Thảo', callback_data: 'status-thao' },
            { text: '🐪 Vũ', callback_data: 'status-vu' }
          ],
          [
            { text: 'Dev Nam', callback_data: 'status-nam' },
            { text: 'Tùng', callback_data: 'status-tung' }
          ],
          [
            { text: 'Phượng', callback_data: 'status-phuong' },
            { text: 'Sugar Baby', callback_data: 'status-sugar' }
          ],
          [
            { text: 'Bee', callback_data: 'status-bee' },
            { text: 'Tòng', callback_data: 'status-tong' }
          ],
          [
            { text: 'Chenin', callback_data: 'status-chenin' },
            { text: 'Vương', callback_data: 'status-vuong' }
          ],
          [{ text: '❌ Close', callback_data: 'close' }]
        ]
      })
    }
    console.log('/status')
    bot.sendMessage(chatId, '👉 SELECT AN OPTION', options)
  })

  bot.onText(/\/wallet/, async msg => {
    console.log('/wallet')
    const chatId = msg.chat.id
    const allowedUsernames = readAllowedUsernames()
    const isAllowedUser = allowedUsernames.includes(msg.chat.username)

    if (!isAllowedUser) {
      await bot.sendMessage(
        msg.chat.id,
        'You are not authorized to use this command.'
      )
      console.log(
        `${msg.chat.username} You are not authorized to use this command.`
      )
      return
    }

    try {
      const enterMessage = await bot.sendMessage(
        chatId,
        'Please enter the wallet address:',
        {
          reply_markup: {
            keyboard: [[{ text: '❌ Cancel' }]],
            resize_keyboard: true,
            one_time_keyboard: true
          }
        }
      )

      bot.once('message', async _msg => {
        await bot.deleteMessage(chatId, enterMessage.message_id)

        if (_msg.text === '❌ Cancel') {
          await bot.deleteMessage(chatId, _msg.message_id)
          return
        }

        const walletAddress = _msg.text
        const _shortenAddress = shortenAddress(walletAddress)

        const loadingMessage = await bot.sendMessage(
          chatId,
          `⌛️ Loading ${_shortenAddress}`,
          {
            reply_markup: {
              inline_keyboard: [[{ text: '❌ Close', callback_data: 'close' }]]
            }
          }
        )

        const { walletInfo, fileName } = await getUserAddressFromFiles(
          '../wallets',
          walletAddress
        )

        if (walletInfo) {
          const devName = fileName.replace('.json', '')
          const walletName = `${devName}-${walletInfo.name}`
          const balance = await getBalance([walletInfo])
          const txs = await getTotalTxs([walletInfo])
          const stakingBalance = await getStakingBalances([walletInfo])

          const text = await getTextMessage(
            `${_shortenAddress} (${walletName})`,
            1,
            txs,
            balance,
            stakingBalance
          )

          await bot.editMessageText(text, {
            chat_id: chatId,
            message_id: loadingMessage.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: '❌ Close', callback_data: 'close' }]]
            }
          })
        } else {
          await bot.editMessageText('Wallet address not found.', {
            chat_id: chatId,
            message_id: loadingMessage.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[{ text: '❌ Close', callback_data: 'close' }]]
            }
          })
        }
      })
    } catch (error) {
      // console.error('Error processing /wallets command:', error)
      await bot.sendMessage(
        chatId,
        'Error processing /wallets command. Please try again later.',
        {
          reply_markup: {
            inline_keyboard: [[{ text: '❌ Close', callback_data: 'close' }]]
          }
        }
      )
    }
  })

  bot.onText(/\/unstaked/, async msg => {
    const chatId = msg.chat.id
    const allowedUsernames = readAllowedUsernames()
    const isAllowedUser = allowedUsernames.includes(msg.chat.username)

    if (!isAllowedUser) {
      await bot.sendMessage(
        msg.chat.id,
        'You are not authorized to use this command.'
      )
      console.log(
        `@${msg.chat.username} You are not authorized to use this command.`
      )
      return
    }

    const options = {
      reply_markup: JSON.stringify({
        inline_keyboard: [
          [
            { text: 'Dev Mỹ', callback_data: 'unstaked-my' },
            { text: 'Dev Dương', callback_data: 'unstaked-dpa' }
          ],
          [
            { text: 'Dev HKA', callback_data: 'unstaked-hka' },
            { text: 'Peo', callback_data: 'unstaked-peo' }
          ],
          [
            { text: 'Thảo', callback_data: 'unstaked-thao' },
            { text: '🐪 Vũ', callback_data: 'unstaked-vu' }
          ],
          [
            { text: 'Dev Nam', callback_data: 'unstaked-nam' },
            { text: 'Tùng', callback_data: 'unstaked-tung' }
          ],
          [
            { text: 'Phượng', callback_data: 'unstaked-phuong' },
            { text: 'Sugar Baby', callback_data: 'unstaked-sugar' }
          ],
          [
            { text: 'Bee', callback_data: 'unstaked-bee' },
            { text: 'Tòng', callback_data: 'unstaked-tong' }
          ],
          [
            { text: 'Chenin', callback_data: 'unstaked-chenin' },
            { text: 'Vương', callback_data: 'unstaked-vuong' }
          ],
          [{ text: '❌ Close', callback_data: 'close' }]
        ]
      })
    }
    console.log('/unstaked')
    bot.sendMessage(chatId, '👉 SELECT AN OPTION', options)
  })

  bot.onText(/\/warden/, async msg => {
    const chatId = msg.chat.id
    const allowedUsernames = readAllowedUsernames()
    const isAllowedUser = allowedUsernames.includes(msg.chat.username)

    if (!isAllowedUser) {
      await bot.sendMessage(
        msg.chat.id,
        'You are not authorized to use this command.'
      )
      console.log(
        `@${msg.chat.username} You are not authorized to use this command.`
      )
      return
    }

    const options = {
      reply_markup: JSON.stringify({
        inline_keyboard: [
          [{ text: '👩‍👩‍👧‍👧 Tất cả', callback_data: 'warden-all' }],
          [
            { text: 'Dev Mỹ', callback_data: 'warden-my' },
            { text: 'Dev Dương', callback_data: 'warden-dpa' }
          ],
          [
            { text: 'Dev HKA', callback_data: 'warden-hka' },
            { text: 'Peo', callback_data: 'warden-peo' }
          ],
          [
            { text: 'Thảo', callback_data: 'warden-thao' },
            { text: '🐪 Vũ', callback_data: 'warden-vu' }
          ],
          [
            { text: 'Dev Nam', callback_data: 'warden-nam' },
            { text: 'Tùng', callback_data: 'warden-tung' }
          ],
          [
            { text: 'Phượng', callback_data: 'warden-phuong' },
            { text: 'Sugar Baby', callback_data: 'warden-sugar' }
          ],
          [
            { text: 'Bee', callback_data: 'warden-bee' },
            { text: 'Tòng', callback_data: 'warden-tong' }
          ],
          [
            { text: 'Chenin', callback_data: 'warden-chenin' },
            { text: 'Vương', callback_data: 'warden-vuong' }
          ],
          [{ text: '❌ Close', callback_data: 'close' }]
        ]
      })
    }
    console.log('/warden')
    bot.sendMessage(chatId, '👉 SELECT AN OPTION', options)
  })

  bot.onText(/\/hava/, async msg => {
    const chatId = msg.chat.id
    const allowedUsernames = readAllowedUsernames()
    const isAllowedUser = allowedUsernames.includes(msg.chat.username)

    if (!isAllowedUser) {
      await bot.sendMessage(
        msg.chat.id,
        'You are not authorized to use this command.'
      )
      console.log(
        `@${msg.chat.username} You are not authorized to use this command.`
      )
      return
    }

    const options = {
      reply_markup: JSON.stringify({
        inline_keyboard: [
          [{ text: '👩‍👩‍👧‍👧 Tất cả', callback_data: 'hava-all' }],
          [
            { text: 'Dev Mỹ', callback_data: 'hava-my' },
            { text: 'Dev Dương', callback_data: 'hava-dpa' }
          ],
          [
            { text: 'Dev HKA', callback_data: 'hava-hka' },
            { text: 'Peo', callback_data: 'hava-peo' }
          ],
          [
            { text: 'Thảo', callback_data: 'hava-thao' },
            { text: '🐪 Vũ', callback_data: 'hava-vu' }
          ],
          [
            { text: 'Dev Nam', callback_data: 'hava-nam' },
            { text: 'Tùng', callback_data: 'hava-tung' }
          ],
          [
            { text: 'Phượng', callback_data: 'hava-phuong' },
            { text: 'Sugar Baby', callback_data: 'hava-sugar' }
          ],
          [
            { text: 'Bee', callback_data: 'hava-bee' },
            { text: 'Tòng', callback_data: 'hava-tong' }
          ],
          [
            { text: 'Chenin', callback_data: 'hava-chenin' },
            { text: 'Vương', callback_data: 'hava-vuong' }
          ],
          [{ text: '❌ Close', callback_data: 'close' }]
        ]
      })
    }
    console.log('/hava')
    bot.sendMessage(chatId, '👉 SELECT AN OPTION', options)
  })

  bot.on('callback_query', async callbackQuery => {
    const { message, data } = callbackQuery
    const chatId = message.chat.id

    if (data === 'close') {
      try {
        await bot.deleteMessage(chatId, message.message_id)
        return
      } catch (error) {
        console.error('Error deleting message:', error)
      }
    }

    if (data.includes('status-')) {
      await getStatus(chatId, data.replace('status-', ''))
    }

    if (data.includes('unstaked-')) {
      await getUnstakedWallets(chatId, data.replace('unstaked-', ''))
    }

    if (data.includes('warden-')) {
      await getWardenAirdrop(chatId, data.replace('warden-', ''))
    }

    if (data.includes('hava-')) {
      await getHavaAirdrop(chatId, data.replace('hava-', ''))
    }
  })

  bot.on('polling_error', error => {
    console.error(error)
  })

  console.log('Bot is running...')
}

createBot()
