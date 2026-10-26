// Everything that talks to Firebase, and the saved Firebase config, lives here.
// The rest of the app only calls the functions below, so another database
// could be added later by writing a different version of this file.

const CONFIG_KEY = "passkeppler.firebaseConfig";
const EMAIL_KEY = "passkeppler.lastEmail";

// ---- Saved settings on this device ----

export function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY)) || null;
  } catch {
    return null;
  }
}

export function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export function loadLastEmail() {
  try {
    return localStorage.getItem(EMAIL_KEY) || "";
  } catch {
    return "";
  }
}

export function saveLastEmail(email) {
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    /* not important */
  }
}

// Accepts what Firebase shows ("const firebaseConfig = { ... };") or plain JSON.
export function parseConfig(text) {
  const wanted = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"];
  const config = {};
  const pattern = /["']?([A-Za-z]+)["']?\s*:\s*["']([^"']*)["']/g;
  let match;
  while ((match = pattern.exec(text))) {
    if (wanted.includes(match[1])) config[match[1]] = match[2].trim();
  }
  const missing = ["apiKey", "authDomain", "projectId"].filter((key) => !config[key]);
  if (missing.length) {
    throw new Error(
      "This doesn't look like a Firebase config. Missing: " + missing.join(", ") + ". Paste the whole block Firebase showed you."
    );
  }
  return config;
}

// ---- Firebase ----

let fb = null;
let auth = null;
let db = null;
let uid = null;

export async function connect(config) {
  if (auth) return;
  try {
    fb = await import("./firebase.js");
  } catch {
    throw new Error("Couldn't load Firebase. Check your internet connection and try again.");
  }
  const app = fb.initializeApp(config);
  auth = fb.getAuth(app);
  try {
    // Keeps an (already scrambled) copy of the vault on this device, so it still opens offline.
    db = fb.initializeFirestore(app, {
      localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }),
    });
  } catch {
    db = fb.getFirestore(app);
  }
}

export async function signUp(email, authPassword) {
  const credential = await fb.createUserWithEmailAndPassword(auth, email.trim(), authPassword);
  uid = credential.user.uid;
}

export async function signIn(email, authPassword) {
  const credential = await fb.signInWithEmailAndPassword(auth, email.trim(), authPassword);
  uid = credential.user.uid;
}

export async function signOut() {
  uid = null;
  if (auth) await fb.signOut(auth);
}

// ---- Entries ----
// Each entry is stored as one scrambled blob: { id, schemaVersion, updatedAt, iv, ct }.

// Calls onChange with the full list of stored entries now, and again whenever it changes
// (including changes made on another device). Returns a function that stops listening.
export function subscribeEntries(onChange, onError) {
  const entries = fb.collection(db, "users", uid, "entries");
  return fb.onSnapshot(entries, (snapshot) => onChange(snapshot.docs.map((d) => d.data())), onError);
}

// Saves on this device straight away, and to Firebase when it can.
export function putEntry(entryDoc) {
  return fb.setDoc(fb.doc(db, "users", uid, "entries", entryDoc.id), entryDoc);
}

export function removeEntry(id) {
  return fb.deleteDoc(fb.doc(db, "users", uid, "entries", id));
}

export function describeError(err) {
  const messages = {
    "auth/email-already-in-use": "An account with this email already exists. Use Unlock instead.",
    "auth/invalid-credential": "Wrong email or master password, or no account exists yet. Check both, or create an account.",
    "auth/wrong-password": "Wrong email or master password.",
    "auth/user-not-found": "No account with this email. Create an account first.",
    "auth/invalid-email": "That email address isn't valid.",
    "auth/too-many-requests": "Too many attempts. Wait a few minutes and try again.",
    "auth/network-request-failed": "Couldn't reach Firebase. Check your internet connection.",
    "auth/operation-not-allowed": "Email/Password sign-in isn't turned on in your Firebase project. Enable it under Authentication, then Sign-in method.",
    "auth/invalid-api-key": "The Firebase config has an invalid API key. Check the config you pasted.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "The Firebase config has an invalid API key. Check the config you pasted.",
    "auth/unauthorized-domain": "This web address isn't allowed in your Firebase project. Add it under Authentication, then Settings, then Authorised domains.",
    "auth/configuration-not-found": "Authentication isn't set up in your Firebase project yet. Open Authentication and click Get started.",
    "permission-denied": "Firebase refused this. Publish the rules from firestore.rules in your Firebase project (Firestore Database, then Rules).",
    "unavailable": "Couldn't reach Firebase. Your changes are kept on this device and will sync when you're back online.",
    "not-found": "Your Firestore database hasn't been created yet. Create it in the Firebase console under Firestore Database.",
  };
  if (err && messages[err.code]) return messages[err.code];
  if (err && err.message && !err.code) return err.message;
  return "Something went wrong" + (err && err.code ? " (" + err.code + ")" : "") + ". Try again.";
}
