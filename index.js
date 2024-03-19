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

let cachedData = {}

const callAPI = async wallet => {
  const { address, hex } = wallet
  try {
    const previousTxResults =
      cachedData[address] || (await getPreviousTxResultsFromFirestore(address))
    const previousTxHashes = new Set(previousTxResults.map(tx => tx.tx_hash))

    const API_URL = `https://api-indexer.keplr.app/v1/history/${hex}?limit=100000&offset=0&chains=cosmoshub`
    const response = await axios.get(API_URL)
    const { txResults } = response.data[0]

    const newTxResults = txResults.filter(
      tx => !previousTxHashes.has(tx.tx_hash)
    )

    if (newTxResults.length > 0) {
      console.log(`✅ New transactions for address ${address}:`, newTxResults)
      await saveTxResultsOnFirestore(address, newTxResults)
    } else {
      console.log(`No new transactions for address ${address}`)
    }

    cachedData[address] = previousTxResults.concat(newTxResults)
  } catch (error) {
    console.error(`Error calling API for ${address}:`, error)
  }
}

const readFile = async filePath => {
  try {
    const fileContent = await fs.readFile(filePath, 'utf8')
    const wallets = JSON.parse(fileContent)

    await Promise.all(wallets.map(wallet => callAPI(wallet)))
  } catch (error) {
    console.error('Error reading file or calling APIs:', error)
  }
}

const callAPIsForAllFiles = async () => {
  const fileNames = ['hka.json']

  try {
    for (const fileName of fileNames) {
      const filePath = `wallets/${fileName}` // Thay đổi đường dẫn tương ứng với vị trí của tệp
      await readFile(filePath)
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

    if (!snapshot.empty) {
      const txs = snapshot.docs[0].data().txs || {}
      const previousTxResults = Object.entries(txs)
        .sort()
        .map(([, value]) => ({
          ...value
        }))
      return previousTxResults
    }
  } catch (error) {
    console.error(
      `Error getting previous transactions from Firestore for address ${address}:`,
      error
    )
    return []
  }
}

const saveTxResultsOnFirestore = async (address, newTxResults) => {
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
      console.log(
        `Updated new transactions for address ${address} to Firestore`
      )
    } else {
      await addDoc(collection(firestore, 'transactions'), {
        address,
        txs: newTxResults
      })
      console.log(`Saved new transactions for address ${address} to Firestore`)
    }
  } catch (error) {
    console.error(
      `Error saving results to Firestore for address ${address}:`,
      error
    )
  }
}

setInterval(() => {
  callAPIsForAllFiles()
}, 10000)
