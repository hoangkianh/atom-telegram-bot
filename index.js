import axios from 'axios'
import fs from 'fs/promises'
import { Command } from 'commander'
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
  '/cosmos.staking.v1beta1.MsgUndelegate'
  //   '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward',
]

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

const callAPI = async (wallet, fileName, wallets) => {
  const { address, hex, name } = wallet
  const walletName = `${fileName.toUpperCase()}-${name}`

  try {
    const previousTxHashes =
      cachedData[address] || (await getPreviousTxHashesFromFirestore(address))

    const API_URL = `https://api-indexer.keplr.app/v1/history/${hex}?limit=100000&offset=0&chains=cosmoshub`
    const response = await axios.get(API_URL)
    const { txResults } = response.data[0]

    const newTxResults = txResults.filter(
      tx => !previousTxHashes.includes(tx.tx_hash)
    )

    const filteredNewTxResults = newTxResults.filter(tx =>
      tx.tx_messages.some(
        msg => msg.signer === address && TYPES.includes(msg.type)
      )
    )

    if (filteredNewTxResults.length > 0) {
      console.log(
        `✅ New transactions for ${walletName}:`,
        filteredNewTxResults
      )
      await saveTxHashesOnFirestore(address, walletName, filteredNewTxResults)
      processTransactions(filteredNewTxResults, address, walletName, wallets)
    } else {
      console.log(`No new transactions for ${walletName}`)
    }

    cachedData[address] = previousTxHashes.concat(
      filteredNewTxResults.map(tx => tx.tx_hash)
    )
  } catch (error) {
    console.error(`Error calling API for ${walletName}:`, error)
  }
}

const readFile = async fileName => {
  try {
    const fileContent = await fs.readFile(`wallets/${fileName}`, 'utf8')
    const wallets = JSON.parse(fileContent)

    await Promise.all(
      wallets.map(wallet =>
        callAPI(wallet, fileName.replace('.json', ''), wallets)
      )
    )
  } catch (error) {
    console.error('Error reading file or calling APIs:', error)
  }
}

// const callAPIsForAllFiles = async () => {
//   const fileNames = ['hka.json']

//   try {
//     for (const fileName of fileNames) {
//       await readFile(fileName)
//     }
//   } catch (error) {
//     console.error('Error calling APIs for all files:', error)
//   }
// }

const getPreviousTxHashesFromFirestore = async address => {
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
    return txs
  } catch (error) {
    console.error(
      `Error getting previous transactions from Firestore for address ${address}:`,
      error
    )
    return []
  }
}

const saveTxHashesOnFirestore = async (address, walletName, newTxResults) => {
  try {
    const q = query(
      collection(firestore, 'transactions'),
      where('address', '==', address)
    )
    const snapshot = await getDocs(q)
    const txHashes = new Set(newTxResults.map(tx => tx.tx_hash))

    if (!snapshot.empty) {
      const currentData = snapshot.docs[0].data()

      const newData = {
        ...currentData,
        txs: [...Array.from(txHashes), ...currentData.txs]
      }

      await updateDoc(
        doc(firestore, 'transactions', snapshot.docs[0].id),
        newData
      )
      console.log(`Updated new transactions for ${walletName} to Firestore`)
    } else {
      await addDoc(collection(firestore, 'transactions'), {
        address,
        txs: Array.from(txHashes)
      })
      console.log(`Saved new transactions for ${walletName} to Firestore`)
    }
  } catch (error) {
    console.error(`Error saving results to Firestore for ${walletName}:`, error)
  }
}

const processTransactions = (transactions, address, walletName, wallets) => {
  transactions.forEach(tx => {
    const type = tx.tx_messages[0].type
    const msg_string = JSON.parse(tx.tx_messages[0].msg_string)
    const txHash = tx.tx_hash
    const txLink = `https://mintscan.io/cosmos/transactions/${txHash}`
    const walletLink = `https://mintscan.io/cosmos/address/${address}`
    let message = ''

    switch (type) {
      case '/cosmos.bank.v1beta1.MsgSend':
        const toWalletAddress = tx.tx_messages.find(
          msg => msg.type === '/manythings.bank.v1beta1.MsgReceive'
        ).signer
        const toWallet = wallets.find(a => a.address === toWalletAddress)
        const toWalletMintscanLink = `https://mintscan.io/cosmos/address/${toWalletAddress}`
        const toWalletName = toWallet
          ? walletName.split('-')[0] + '-' + toWallet.name
          : toWalletAddress
        const amount = Number(msg_string?.amount?.[0]?.amount) / 1_000_000

        message = `➡️ Wallet [${walletName}](${walletLink}) just sent ${amount} ATOM to [${toWalletName}](${toWalletMintscanLink})\n`
        break
      //   case '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward':
      //     message = `💰 Wallet [${walletName}](${walletLink}) just claimed reward\n`
      //     break
      case '/cosmos.staking.v1beta1.MsgUndelegate':
        const unstakedAmount = Number(msg_string?.amount?.amount) / 1_000_000

        message = `‼️ Wallet [${walletName}](${walletLink}) just unstaked ${unstakedAmount} ATOM\n`
        break
      default:
        break
    }

    sendTelegramMessage(`${message} \n\n [View on Mintscan](${txLink})`)
  })
}

setInterval(() => {
  //   callAPIsForAllFiles()
  readFile(fileName)
}, 10000)
