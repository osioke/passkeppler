// The one place that says where the Firebase code comes from.
// For now it is loaded from Google's servers. The browser extension will need a
// local copy instead, and swapping it in only means changing these lines.

export { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
export {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
export {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  writeBatch,
  deleteDoc,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
