// src/services/firebase.js
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
apiKey: "AIzaSyBCp6XmixMcOTCeUYLwQgT62Yb_ZB2yrmw",
authDomain: "projeto-caravana.firebaseapp.com",
projectId: "projeto-caravana",
storageBucket: "projeto-caravana.appspot.com", 
messagingSenderId: "109406579691",
appId: "1:109406579691:web:fb554cb4a7663781c787ae",
measurementId: "G-33W1PLKYV3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

export { auth, db, app, storage, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut };
