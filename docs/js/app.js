import { deriveKeys, decryptJSON } from "./crypto.js";
import * as store from "./store.js";
import { setupRevealToggles, hideAllPasswords } from "./ui.js";
import { openVault, closeVault, tell, setConnection } from "./vault.js";
import * as keep from "./session.js";

const $ = (id) => document.getElementById(id);
const views = ["setup", "auth", "vault"];

// Held in memory only. Closing or reloading the page forgets it, so the
// master password is asked for again.
let session = null; // { email, encKey }
let mode = "unlock"; // or "create"

function show(name, focusId) {
  for (const view of views) $("view-" + view).hidden = view !== name;
  document.body.dataset.view = name;
  document.title =
    (name === "setup" ? "Connect Firebase" : name === "vault" ? "Vault" : mode === "create" ? "Create account" : "Unlock") +
    " · passkeppler";
  if (focusId) $(focusId).focus();
}

function setError(id, message) {
  $(id).textContent = message || "";
}

// Shows a problem and puts the cursor where it needs fixing.
function fail(errorId, message, focusId) {
  setError(errorId, message);
  if (focusId) $(focusId).focus();
}

setupRevealToggles();

// ---- Connect Firebase ----

$("setup-form").addEventListener("submit", (event) => {
  event.preventDefault();
  setError("setup-error", "");
  try {
    const config = store.parseConfig($("config-text").value);
    store.saveConfig(config);
    // Reload so the app starts cleanly with the new project.
    location.reload();
  } catch (err) {
    fail("setup-error", err.message, "config-text");
  }
});

$("setup-cancel").addEventListener("click", () => show("auth", "password"));

$("change-config").parentElement.hidden = store.hasBundledConfig; // nothing to change when it's built in

$("change-config").addEventListener("click", () => {
  $("setup-cancel").hidden = false;
  show("setup", "config-text");
});

// ---- Unlock / create account ----

function setMode(next) {
  mode = next;
  const creating = mode === "create";
  $("auth-title").textContent = creating ? "Create your vault" : "Unlock your vault";
  $("auth-submit").textContent = creating ? "Create account" : "Unlock";
  $("auth-toggle").textContent = creating ? "I already have an account" : "Create an account instead";
  $("confirm-group").hidden = !creating;
  $("password").autocomplete = creating ? "new-password" : "current-password";
  document.title = (creating ? "Create account" : "Unlock") + " · passkeppler";
  setError("auth-error", "");
}

$("auth-toggle").addEventListener("click", () => setMode(mode === "create" ? "unlock" : "create"));

function setBusy(busy) {
  $("auth-submit").disabled = busy;
  $("auth-form").setAttribute("aria-busy", String(busy));
  $("auth-submit").textContent = busy
    ? mode === "create" ? "Creating…" : "Unlocking…"
    : mode === "create" ? "Create account" : "Unlock";
}

$("auth-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setError("auth-error", "");

  const email = $("email").value.trim();
  const password = $("password").value;

  if (!email) return fail("auth-error", "Enter your email.", "email");
  if (!password) return fail("auth-error", "Enter your master password.", "password");
  if (mode === "create") {
    if (password.length < 12) {
      return fail("auth-error", "Use at least 12 characters. A few random words joined together works well.", "password");
    }
    if (password !== $("confirm").value) {
      return fail("auth-error", "The two master passwords don't match.", "confirm");
    }
  }

  setBusy(true);
  try {
    const { authPassword, encKey } = await deriveKeys(email, password, undefined, keep.enabled);
    await store.connect(store.loadConfig());
    let offline = false;
    if (mode === "create") await store.signUp(email, authPassword);
    else {
      try {
        await store.signIn(email, authPassword);
      } catch (err) {
        if (!store.isOfflineError(err)) throw err;
        await checkAgainstThisDevice(email, encKey, err);
        offline = true;
      }
    }

    await keep.save({ email, authPassword, encKey });
    store.saveLastEmail(email);
    $("password").value = "";
    $("confirm").value = "";
    hideAllPasswords();
    enter(email, encKey);
    if (offline) workOffline(email, authPassword);
  } catch (err) {
    setError("auth-error", store.describeError(err));
  } finally {
    setBusy(false);
  }
});

// Firebase can't be reached. If this device holds a copy of the vault, the master password is
// checked by opening one entry of it. Throws the original error if there is no copy to open,
// or a wrong-password error if the entry won't open.
async function checkAgainstThisDevice(email, encKey, original) {
  const stored = await store.entriesOnThisDevice(email);
  if (!stored) throw original;
  try {
    await decryptJSON(encKey, stored[0]);
  } catch {
    throw Object.assign(new Error("Wrong master password"), { code: "auth/invalid-credential" });
  }
}

function workOffline(email, authPassword) {
  setConnection(false);
  tell("You're offline. This is the copy saved on this device, and changes will be sent once you're back online.");
  store.syncWhenOnline(email, authPassword, () => {
    setConnection(true);
    tell("Back online. Your changes are syncing.");
  });
}

function enter(email, encKey) {
  session = { email, encKey };
  setConnection(true);
  openVault(email, encKey);
  show("vault");
}

// ---- Lock ----

$("lock").addEventListener("click", async () => {
  session = null;
  await keep.clear();
  closeVault();
  hideAllPasswords();
  try {
    await store.signOut();
  } catch {
    /* locking still works if sign-out fails */
  }
  setMode("unlock");
  show("auth", "password");
});

// ---- Start ----

// Only the extension keeps an unlock between openings; for the web app load() finds nothing.
async function resume() {
  const saved = await keep.load();
  if (!saved) return false;
  try {
    await store.connect(store.loadConfig());
    try {
      await store.signIn(saved.email, saved.authPassword);
      enter(saved.email, saved.encKey);
    } catch (err) {
      // No connection: the key is already known to be right, so just check there is a copy here.
      if (!store.isOfflineError(err) || !(await store.entriesOnThisDevice(saved.email))) throw err;
      enter(saved.email, saved.encKey);
      workOffline(saved.email, saved.authPassword);
    }
    return true;
  } catch {
    await keep.clear();
    return false;
  }
}

if (store.loadConfig()) {
  $("email").value = store.loadLastEmail();
  if (!(await resume())) show("auth", $("email").value ? "password" : "email");
} else {
  show("setup", "config-text");
}
