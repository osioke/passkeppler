// Everything that talks to Firebase, and the saved Firebase config, lives here.
// The rest of the app only calls the functions below, so another database
// could be added later by writing a different version of this file.

const CONFIG_KEY = "passkeppler.firebaseConfig";
const EMAIL_KEY = "passkeppler.lastEmail";
const UID_KEY = "passkeppler.uid:"; // plus the email; remembered so a device can find its own copy offline

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
  // Nothing is sent to Firebase until we're signed in. Otherwise changes waiting from an earlier
  // session could be sent without a login, refused, and lost.
  await fb.disableNetwork(db);
}

async function signedIn(email, credential) {
  uid = credential.user.uid;
  try {
    localStorage.setItem(UID_KEY + email.trim().toLowerCase(), uid);
  } catch {
    /* offline unlock just won't be available */
  }
  await fb.enableNetwork(db);
}

export async function signUp(email, authPassword) {
  await signedIn(email, await fb.createUserWithEmailAndPassword(auth, email.trim(), authPassword));
}

export async function signIn(email, authPassword) {
  await signedIn(email, await fb.signInWithEmailAndPassword(auth, email.trim(), authPassword));
}

// ---- Working without a connection ----

export function isOfflineError(err) {
  return !!err && err.code === "auth/network-request-failed";
}

// The scrambled entries this device already holds, or null if there are none to open.
export async function entriesOnThisDevice(email) {
  let saved = null;
  try {
    saved = localStorage.getItem(UID_KEY + email.trim().toLowerCase());
  } catch {
    /* treated as none */
  }
  if (!saved || !db) return null;
  try {
    const snapshot = await fb.getDocsFromCache(fb.collection(db, "users", saved, "entries"));
    if (snapshot.empty) return null;
    uid = saved;
    return snapshot.docs.map((d) => d.data());
  } catch {
    return null;
  }
}

let stopSync = null;

// While working offline: keeps trying to sign in, and the moment that works, changes made in
// the meantime are sent. Calls onSynced once. Stopped by signOut.
export function syncWhenOnline(email, authPassword, onSynced) {
  if (stopSync) stopSync();
  let busy = false;
  const stop = () => {
    clearInterval(timer);
    window.removeEventListener("online", attempt);
    stopSync = null;
  };
  async function attempt() {
    if (busy) return;
    busy = true;
    try {
      await signIn(email, authPassword);
      stop();
      onSynced();
    } catch {
      /* still offline; try again later */
    } finally {
      busy = false;
    }
  }
  window.addEventListener("online", attempt);
  const timer = setInterval(attempt, 30000);
  stopSync = stop;
}

export async function signOut() {
  if (stopSync) stopSync();
  uid = null;
  if (auth) await fb.signOut(auth);
  // Changes still waiting stay on this device until the next sign-in.
  if (db) await fb.disableNetwork(db);
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

// Saves many at once (Firestore allows up to 500 writes in one batch).
export function putEntries(entryDocs) {
  const batches = [];
  for (let i = 0; i < entryDocs.length; i += 400) {
    const batch = fb.writeBatch(db);
    for (const entryDoc of entryDocs.slice(i, i + 400)) batch.set(fb.doc(db, "users", uid, "entries", entryDoc.id), entryDoc);
    batches.push(batch.commit());
  }
  return Promise.all(batches);
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
