import axios from 'axios'
import fs from 'fs/promises'
import {
  collection,
  where,
  query,
  getDocs,
  addDoc,
  updateDoc,
  doc
} from 'firebase/firestore'
import firestore from './firebase-config.js'
import sendTelegramMessage from './telegram-bot.js'

let cachedData = {}
const TYPES = [
  '/cosmos.bank.v1beta1.MsgSend',
  '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward',
  '/cosmos.staking.v1beta1.MsgUndelegate'
]

const callAPI = async (wallet, fileName) => {
  const { address, hex, name } = wallet
  const walletName = `${fileName.toUpperCase()}-${name}`

  try {
    const previousTxResults =
      cachedData[address] || (await getPreviousTxResultsFromFirestore(address))
    let previousTxHashes = new Set(previousTxResults.map(tx => tx.tx_hash))

    const API_URL = `https://api-indexer.keplr.app/v1/history/${hex}?limit=100000&offset=0&chains=cosmoshub`
    const response = await axios.get(API_URL)
    const { txResults } = response.data[0]

    const newTxResults = txResults.filter(tx =>
      tx.tx_messages.some(
        msg => msg.signer === address && TYPES.includes(msg.type)
      )
    )

    previousTxHashes = new Set(
      previousTxResults
        .filter(tx =>
          tx.tx_messages.some(
            msg => msg.signer === address && TYPES.includes(msg.type)
          )
        )
        .map(tx => tx.tx_hash)
    )

    const filteredNewTxResults = newTxResults.filter(
      tx => !previousTxHashes.has(tx.tx_hash)
    )

    if (filteredNewTxResults.length > 0) {
      console.log(
        `✅ New transactions for ${walletName}:`,
        filteredNewTxResults
      )
      await saveTxResultsOnFirestore(address, walletName, filteredNewTxResults)
      await processTransactions(filteredNewTxResults, address, walletName)
    } else {
      console.log(`No new transactions for ${walletName}`)
    }

    cachedData[address] = previousTxResults.concat(filteredNewTxResults)
  } catch (error) {
    console.error(`Error calling API for ${walletName}:`, error)
  }
}

const readFile = async fileName => {
  try {
    const fileContent = await fs.readFile(`wallets/${fileName}`, 'utf8')
    const wallets = JSON.parse(fileContent)

    await Promise.all(
      wallets.map(wallet => callAPI(wallet, fileName.replace('.json', '')))
    )
  } catch (error) {
    console.error('Error reading file or calling APIs:', error)
  }
}

const callAPIsForAllFiles = async () => {
  const fileNames = ['hka.json']

  try {
    for (const fileName of fileNames) {
      await readFile(fileName)
    }
  } catch (error) {
    console.error('Error calling APIs for all files:', error)
  }
}

const getPreviousTxResultsFromFirestore = async address => {
  try {
    const q = query(
      collection(firestore, 'transactions'),
      where('address', '==', address)
    )
    const snapshot = await getDocs(q)

    if (snapshot.empty) {
      return []
    }

    const txs = snapshot.docs[0].data().txs || {}
    const previousTxResults = Object.entries(txs)
      .sort()
      .map(([, value]) => ({
        ...value
      }))
    return previousTxResults
  } catch (error) {
    console.error(
      `Error getting previous transactions from Firestore for address ${address}:`,
      error
    )
    return []
  }
}

const saveTxResultsOnFirestore = async (address, walletName, newTxResults) => {
  try {
    const q = query(
      collection(firestore, 'transactions'),
      where('address', '==', address)
    )
    const snapshot = await getDocs(q)
    if (!snapshot.empty) {
      const currentData = snapshot.docs[0].data()

      const newData = {
        ...currentData,
        txs: {
          ...currentData.txs,
          ...newTxResults
        }
      }

      await updateDoc(
        doc(firestore, 'transactions', snapshot.docs[0].id),
        newData
      )
      console.log(`Updated new transactions for ${walletName} to Firestore`)
    } else {
      await addDoc(collection(firestore, 'transactions'), {
        address,
        txs: newTxResults
      })
      console.log(`Saved new transactions for ${walletName} to Firestore`)
    }
  } catch (error) {
    console.error(`Error saving results to Firestore for ${walletName}:`, error)
  }
}

const processTransactions = (transactions, address, walletName) => {
  transactions.forEach(tx => {
    const type = tx.tx_messages[0].type
    const msg_string = JSON.parse(tx.tx_messages[0].msg_string)
    const amount = Number(msg_string?.amount.amount) / 1_000_000
    const txHash = tx.tx_hash
    const txLink = `https://mintscan.io/cosmos/transactions/${txHash}`
    const walletLink = `https://mintscan.io/cosmos/transactions/${address}`
    let message = ''

    switch (type) {
      case '/cosmos.bank.v1beta1.MsgSend':
        const toWallet = tx.tx_messages.find(
          msg => msg.type === '/manythings.bank.v1beta1.MsgReceive'
        ).signer
        const toWalletMintscanLink = `https://mintscan.io/cosmos/address/${toWallet}`
        message = `➡️ Wallet [${walletName}](${walletLink}) just sent to [${toWallet}](${toWalletMintscanLink}).`
        break
      case '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward':
        message = `💰 Wallet [${walletName}](${walletLink}) just claimed reward`
        break
      case '/cosmos.staking.v1beta1.MsgUndelegate':
        message = `‼️ Wallet [${walletName}](${walletLink}) just unstaked ${amount} ATOM`
        break
      default:
        break
    }

    console.log(message, txLink)

    // sendTelegramMessage(`${message} [View on Mintscan](${mintscanLink})`, {
    //   parse_mode: 'Markdown'
    // })
  })
}

setInterval(() => {
  callAPIsForAllFiles()
}, 10000)
