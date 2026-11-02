// A hidden page that keeps your unlocked vault open in memory while you are unlocked, so a login
// noticed on a page can be checked against it and saved without opening the popup. Nobody sees
// this page. It is created when you unlock and closed when you press Lock.
//
// It can't read the browser's session storage itself, so background.js hands it the unlock when it
// opens. It answers three questions from background.js: open, decide and save.

import { decryptJSON, encryptJSON } from "./js/crypto.js";
import * as store from "./js/store.js";
import { decide, historyFields, newEntryFrom } from "./offer.js";

let encKey = null;
let entries = null; // decrypted, in memory only; null until the vault has loaded
let opening = false;
let loadCounter = 0;
let announced = false;

const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

// Fills in anything missing, like the vault screen does for older entries.
function normalise(entry) {
  return {
    id: entry.id,
    title: entry.title || "",
    url: entry.url || "",
    username: entry.username || "",
    email: entry.email || "",
    password: entry.password || "",
    notes: entry.notes || "",
    backupCodes: entry.backupCodes || "",
    customFields: Array.isArray(entry.customFields) ? entry.customFields : [],
    createdAt: entry.createdAt || 0,
    updatedAt: entry.updatedAt || 0,
  };
}

async function onStoredEntries(docs) {
  const mine = ++loadCounter;
  const opened = [];
  for (const stored of docs) {
    try {
      opened.push(normalise(await decryptJSON(encKey, stored)));
    } catch {
      /* one that this key can't open is simply left out */
    }
  }
  if (mine !== loadCounter || !encKey) return;
  entries = opened;
  if (!announced) {
    announced = true;
    chrome.runtime.sendMessage({ type: "passkeppler.vaultReady" }).catch(() => {});
  }
}

async function open(session) {
  if (opening || encKey) return;
  opening = true;
  try {
    encKey = await crypto.subtle.importKey("raw", fromBase64(session.key), "AES-GCM", false, ["encrypt", "decrypt"]);
    await store.connect(store.loadConfig());
    // Like the popup: open from the copy on this device, and sign in behind the scenes.
    if (await store.entriesOnThisDevice(session.email)) store.signIn(session.email, session.authPassword).catch(() => {});
    else await store.signIn(session.email, session.authPassword);
    store.subscribeEntries(onStoredEntries, () => {});
  } catch {
    encKey = null; // the popup still works; the next login will try again
  } finally {
    opening = false;
  }
}

function decideNow(login) {
  if (!entries) return { ready: false };
  const result = decide(login, entries);
  return { ready: true, kind: result.kind, title: result.entry ? result.entry.title : "", others: result.others };
}

async function save(login) {
  if (!entries || !encKey) return { ok: false };
  const result = decide(login, entries);
  if (result.kind === "same") return { ok: true, kind: "same" };
  const entry =
    result.kind === "update"
      ? { ...result.entry, password: login.password, customFields: [...result.entry.customFields, ...historyFields(result.entry, login.password)] }
      : { ...normalise(newEntryFrom(login)), id: crypto.randomUUID(), createdAt: Date.now() };
  entry.updatedAt = Date.now();
  const blob = await encryptJSON(encKey, entry);
  const index = entries.findIndex((e) => e.id === entry.id);
  if (index >= 0) entries[index] = entry;
  else entries.push(entry);
  // Saved on this device straight away; Firebase confirms in the background.
  store.putEntry({ id: entry.id, schemaVersion: 1, updatedAt: entry.updatedAt, ...blob }).catch(() => {});
  return { ok: true, kind: result.kind };
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!message || message.target !== "vaulthost") return;
  if (message.type === "passkeppler.open") {
    open(message.session);
    reply({});
  } else if (message.type === "passkeppler.decide") {
    reply(decideNow(message.login));
  } else if (message.type === "passkeppler.save") {
    save(message.login).then(reply, () => reply({ ok: false }));
    return true;
  }
});
