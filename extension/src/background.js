// Runs in the background. The page watcher (watcher.js) can't keep anything itself, so it sends
// us what it saw. We keep it, one login per tab, in chrome.storage.session: memory only, emptied
// when the browser closes, and out of reach of web pages. It stays until you save it, put it
// aside, press Lock, or close the tab.
//
// While you are unlocked, a hidden page (vault-host.js) keeps your vault open. We ask it whether
// the login is new, a changed password, or already saved, and tell the page (card.js) to show the
// card. If the vault isn't open (you're locked, or it's still starting), the icon's "!" badge and
// the popup are the fallback. We never read the vault here.

const PENDING = "passkeppler.pending"; // { tabId: { host, origin, username, password, offer? } }
const SKIPPED = "passkeppler.skipped"; // { tabId: why the last login form there was not noticed }
const SESSION = "passkeppler.session"; // the unlock kept by the popup (see session.js)
const OFFER_MS = 60000; // how long a new page may still show the card after the login

// Tabs whose own card is the one answering, so we don't also tell that card to close.
const answering = new Set();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- What was noticed, one login per tab ----

const readAll = async () => (await chrome.storage.session.get(PENDING))[PENDING] || {};

// Changes are made one at a time, so two messages arriving together can't overwrite each other.
let queue = Promise.resolve();
function change(fn) {
  const run = queue.then(async () => {
    const all = await readAll();
    const result = fn(all);
    await chrome.storage.session.set({ [PENDING]: all });
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

function showBadge(tabId) {
  chrome.action.setBadgeText({ tabId, text: "!" }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#0e6b5e" }).catch(() => {});
  chrome.action.setTitle({ tabId, title: "passkeppler: a login was noticed on this page. Open to save it." }).catch(() => {});
}

function resetBadge(tabId) {
  chrome.action.setBadgeText({ tabId, text: "" }).catch(() => {});
  chrome.action.setTitle({ tabId, title: "passkeppler" }).catch(() => {});
}

async function drop(tabId) {
  await change((all) => delete all[tabId]);
  resetBadge(tabId);
}

async function setSkipped(tabId, reason) {
  const all = (await chrome.storage.session.get(SKIPPED))[SKIPPED] || {};
  if (reason) all[tabId] = reason;
  else delete all[tabId];
  await chrome.storage.session.set({ [SKIPPED]: all });
}

// ---- The hidden vault page ----

async function unlock() {
  return (await chrome.storage.session.get(SESSION))[SESSION] || null;
}

async function askVault(message) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await chrome.runtime.sendMessage({ ...message, target: "vaulthost" });
    } catch {
      await sleep(200); // the page may still be starting
    }
  }
  return undefined;
}

// Makes sure the hidden page exists while you're unlocked. Returns the unlock, or null if locked.
async function startVault() {
  const session = await unlock();
  if (!session) return null;
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["LOCAL_STORAGE"],
      justification: "Keeps your unlocked vault open in the background so a login you just made can be saved from the page.",
    });
  } catch {
    /* it is already there */
  }
  return session;
}

// ---- Deciding what to offer ----

async function decideFor(tabId) {
  const item = (await readAll())[tabId];
  if (!item || item.offer) return;
  const session = await startVault();
  if (!session) return; // locked: the badge and the popup will do
  const login = { host: item.host, origin: item.origin, username: item.username, password: item.password };
  const result = await askVault({ type: "passkeppler.decide", login });
  if (!result || !result.ready) {
    askVault({ type: "passkeppler.open", session }); // it tells us when the vault has loaded
    return;
  }
  if (result.kind === "same") return drop(tabId); // already saved exactly like this: stay quiet
  const offer = { kind: result.kind, title: result.title, host: item.host, username: item.username, at: Date.now() };
  const kept = await change((all) => {
    if (!all[tabId] || all[tabId].password !== item.password || all[tabId].username !== item.username) return false; // a newer login replaced it
    all[tabId].offer = offer;
    return true;
  });
  if (kept) chrome.tabs.sendMessage(tabId, { type: "passkeppler.offer", offer }).catch(() => {});
}

async function decideAllWaiting() {
  for (const [tabId, item] of Object.entries(await readAll())) if (!item.offer) decideFor(Number(tabId));
}

// ---- Messages from pages ----

async function noticed(message, sender) {
  const { username, password } = message;
  if (typeof username !== "string" || typeof password !== "string" || !username || !password) return;
  if (username.length > 500 || password.length > 1000) return;

  // The site comes from the page itself, not from what the page's form said.
  let url;
  try {
    url = new URL(sender.url);
  } catch {
    return;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return;

  const tabId = sender.tab.id;
  setSkipped(tabId, "");
  await change((all) => {
    all[tabId] = { host: url.host.replace(/^www\./, ""), origin: url.origin, username, password };
  });
  showBadge(tabId);
  decideFor(tabId);
}

// A new page asks whether an offer is waiting for its tab (a login usually changes the page).
async function hello(sender) {
  const item = (await readAll())[sender.tab.id];
  if (item && item.offer && Date.now() - item.offer.at < OFFER_MS) return { offer: item.offer };
  return {};
}

async function answer(message, sender) {
  const tabId = sender.tab.id;
  const item = (await readAll())[tabId];
  if (!item || !item.offer) return { ok: false, message: "This login isn't waiting any more. Open passkeppler to check." };
  if (message.action === "dismiss") {
    answering.add(tabId);
    await drop(tabId);
    setTimeout(() => answering.delete(tabId), 1000);
    return { ok: true };
  }
  if (message.action !== "accept") return { ok: false };
  const login = { host: item.host, origin: item.origin, username: item.username, password: item.password };
  const result = await askVault({ type: "passkeppler.save", login });
  if (result && result.ok) {
    answering.add(tabId);
    await drop(tabId);
    setTimeout(() => answering.delete(tabId), 1000);
    return { ok: true, message: result.kind === "update" ? "Password updated." : "Saved to your vault." };
  }
  return { ok: false, message: "Couldn't save it from here. Open passkeppler from the toolbar and save it there." };
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (!message || typeof message.type !== "string") return;
  if (message.type === "passkeppler.vaultReady") return void decideAllWaiting();
  if (!sender.tab) return; // everything else comes from a page
  if (message.type === "passkeppler.skipped" && typeof message.reason === "string") {
    setSkipped(sender.tab.id, message.reason.slice(0, 200));
  } else if (message.type === "passkeppler.noticed") {
    noticed(message, sender);
  } else if (message.type === "passkeppler.hello") {
    hello(sender).then(reply, () => reply({}));
    return true;
  } else if (message.type === "passkeppler.answer") {
    answer(message, sender).then(reply, () => reply({ ok: false }));
    return true;
  }
});

// ---- Keeping things tidy ----

// Going to another page clears the badge, and a login usually sends you to another page, so put it back.
chrome.tabs.onUpdated.addListener(async (tabId, change) => {
  if (!change.status) return;
  if ((await readAll())[tabId]) showBadge(tabId);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  setSkipped(tabId, "");
  change((all) => delete all[tabId]);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "session") return;
  // Unlocked: open the hidden vault page. Locked: close it.
  if (changes[SESSION]) {
    if (changes[SESSION].newValue) startVault().then((session) => session && askVault({ type: "passkeppler.open", session }));
    else chrome.offscreen.closeDocument().catch(() => {});
  }
  // A login that was put aside, saved or cleared (here, in the popup, or by Lock): take its card off the page.
  if (changes[PENDING]) {
    const before = changes[PENDING].oldValue || {};
    const after = changes[PENDING].newValue || {};
    for (const tabId of Object.keys(before)) {
      if (before[tabId].offer && !after[tabId] && !answering.has(Number(tabId))) chrome.tabs.sendMessage(Number(tabId), { type: "passkeppler.close" }).catch(() => {});
    }
  }
});

// Pages that were open before the extension was installed, updated or refreshed have no watcher
// yet (the browser only adds it to pages loaded afterwards), so add it to them now.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["watcher.js", "card.js"] }).catch(() => {
      /* a page that doesn't allow it, such as the browser's own store pages */
    });
  }
  const session = await startVault();
  if (session) askVault({ type: "passkeppler.open", session });
});
