// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCnjI1sLDgAztoY26IdRMPqATARoD9qHuM",
  authDomain: "chronotrack-u10nt.firebaseapp.com",
  projectId: "chronotrack-u10nt",
  storageBucket: "chronotrack-u10nt.firebasestorage.app",
  messagingSenderId: "125029841927",
  appId: "1:125029841927:web:97a624246dba73d9437ea2"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
