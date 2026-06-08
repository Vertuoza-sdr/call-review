import { initializeApp } from "firebase/app"
import { getAuth } from "firebase/auth"
import { getFirestore } from "firebase/firestore"

const firebaseConfig = {
  apiKey: "AIzaSyBPNr56bnvYe1fEf43KBWxCw8UiMZwnTgw",
  authDomain: "vertuoza-call-review.firebaseapp.com",
  projectId: "vertuoza-call-review",
  storageBucket: "vertuoza-call-review.firebasestorage.app",
  messagingSenderId: "1045460628139",
  appId: "1:1045460628139:web:495271f85e40efd47f3dee"
}

const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)
export const db = getFirestore(app)
