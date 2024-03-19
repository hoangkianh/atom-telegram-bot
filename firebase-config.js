import { initializeApp, getApps } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyDlvYUP22tAvNZlUoWqUBx9jQ4LB6ByfHk',
  authDomain: 'raptor-atom.firebaseapp.com',
  projectId: 'raptor-atom',
  storageBucket: 'raptor-atom.appspot.com',
  messagingSenderId: '528782810918',
  appId: '1:528782810918:web:465a2e1c0bdd8ee87a2be7'
}

let app
if (!getApps().length) {
  app = initializeApp(firebaseConfig)
}

export default getFirestore(app)
