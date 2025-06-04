import firebase from 'firebase/compat/app';
import 'firebase/compat/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyC-y4YY70SOfqFu5fdEn6KQP1iil1Ggutg",
  authDomain: "oweme-469e0.firebaseapp.com",
  projectId: "oweme-469e0",
  storageBucket: "oweme-469e0.firebasestorage.app",
  messagingSenderId: "736723332834",
  appId: "1:736723332834:android:4d7b077515d8d99544f8bb"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

export { firebase };
