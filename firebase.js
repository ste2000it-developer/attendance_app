import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCJiQv3qKiOu1xyCp81pofQmEul_ceecKY",
  authDomain: "company-backends.firebaseapp.com",
  projectId: "company-backends",
  storageBucket: "company-backends.firebasestorage.app",
  messagingSenderId: "830419322417",
  appId: "1:830419322417:web:71f846132f2bb21f73b710"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

await setPersistence(auth, browserLocalPersistence);

export {
  auth,
  db,
  storage,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  serverTimestamp,
  ref,
  uploadBytes,
  getDownloadURL,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
};
