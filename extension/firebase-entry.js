// The same names docs/js/firebase.js exports, but from the Firebase package, so esbuild
// can bundle them into one local file. (Manifest V3 doesn't allow loading code from the internet.)
// "firebase/auth/web-extension" is Firebase's build of sign-in for extensions.
export { initializeApp } from "firebase/app";
export { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from "firebase/auth/web-extension";
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
} from "firebase/firestore";
