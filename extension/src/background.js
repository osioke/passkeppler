// Runs in the background. The page watcher (watcher.js) can't keep anything itself, so it sends
// us what it saw. We keep it, one login per tab, in chrome.storage.session: memory only, emptied
// when the browser closes, and out of reach of web pages. It stays until you save it, put it
// aside, press Lock, or close the tab. We never open the vault here; only the popup can.

const PENDING = "passkeppler.pending";

async function readAll() {
  return (await chrome.storage.session.get(PENDING))[PENDING] || {};
}

function showBadge(tabId) {
  chrome.action.setBadgeText({ tabId, text: "!" }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#0e6b5e" }).catch(() => {});
  chrome.action.setTitle({ tabId, title: "passkeppler: a login was noticed on this page. Open to save it." }).catch(() => {});
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (!message || message.type !== "passkeppler.noticed" || !sender.tab || !sender.url) return;
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
  readAll().then(async (all) => {
    all[tabId] = { host: url.host.replace(/^www\./, ""), origin: url.origin, username, password };
    await chrome.storage.session.set({ [PENDING]: all });
    showBadge(tabId);
  });
});

// Going to another page clears the badge, and a login usually sends you to another page, so put it back.
chrome.tabs.onUpdated.addListener(async (tabId, change) => {
  if (!change.status) return;
  if ((await readAll())[tabId]) showBadge(tabId);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const all = await readAll();
  if (!all[tabId]) return;
  delete all[tabId];
  await chrome.storage.session.set({ [PENDING]: all });
});
