import { deriveKeys } from "./crypto.js";
import * as store from "./store.js";
import { setupRevealToggles, hideAllPasswords } from "./ui.js";
import { openVault, closeVault } from "./vault.js";

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
    const { authPassword, encKey } = await deriveKeys(email, password);
    await store.connect(store.loadConfig());
    if (mode === "create") await store.signUp(email, authPassword);
    else await store.signIn(email, authPassword);

    session = { email, encKey };
    store.saveLastEmail(email);
    $("password").value = "";
    $("confirm").value = "";
    hideAllPasswords();
    openVault(email, encKey);
    show("vault");
  } catch (err) {
    setError("auth-error", store.describeError(err));
  } finally {
    setBusy(false);
  }
});

// ---- Lock ----

$("lock").addEventListener("click", async () => {
  session = null;
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

if (store.loadConfig()) {
  $("email").value = store.loadLastEmail();
  show("auth", $("email").value ? "password" : "email");
} else {
  show("setup", "config-text");
}
