import { getAuth } from 'firebase/auth';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: 'AIzaSyDdv3csW5F0nE8qGLo0BbpYUzYstQ8EVZM',
  authDomain: 'tonteu-759c7.firebaseapp.com',
  projectId: 'tonteu-759c7',
  storageBucket: 'tonteu-759c7.firebasestorage.app',
  messagingSenderId: '5478211253',
  appId: '1:5478211253:web:77790b064fe59405b0e8fc'
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
