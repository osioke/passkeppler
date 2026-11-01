// Runs in the background. The page watcher (watcher.js) can't keep anything itself, so it sends
// us what it saw. We keep it, one login per tab, in chrome.storage.session: memory only, emptied
// when the browser closes, and out of reach of web pages. It stays until you save it, put it
// aside, press Lock, or close the tab. We never open the vault here; only the popup can.

const PENDING = "passkeppler.pending";
const SKIPPED = "passkeppler.skipped"; // { tabId: why the last login form there was not noticed }

async function readAll() {
  return (await chrome.storage.session.get(PENDING))[PENDING] || {};
}

function showBadge(tabId) {
  chrome.action.setBadgeText({ tabId, text: "!" }).catch(() => {});
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#0e6b5e" }).catch(() => {});
  chrome.action.setTitle({ tabId, title: "passkeppler: a login was noticed on this page. Open to save it." }).catch(() => {});
}

async function setSkipped(tabId, reason) {
  const all = (await chrome.storage.session.get(SKIPPED))[SKIPPED] || {};
  if (reason) all[tabId] = reason;
  else delete all[tabId];
  await chrome.storage.session.set({ [SKIPPED]: all });
}

chrome.runtime.onMessage.addListener((message, sender) => {
  if (message && message.type === "passkeppler.skipped" && sender.tab && typeof message.reason === "string") {
    setSkipped(sender.tab.id, message.reason.slice(0, 200));
    return;
  }
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
  setSkipped(tabId, "");
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
  setSkipped(tabId, "");
  const all = await readAll();
  if (!all[tabId]) return;
  delete all[tabId];
  await chrome.storage.session.set({ [PENDING]: all });
});

// Pages that were open before the extension was installed, updated or refreshed have no watcher
// yet (the browser only adds it to pages loaded afterwards), so add it to them now.
chrome.runtime.onInstalled.addListener(async () => {
  const tabs = await chrome.tabs.query({ url: ["http://*/*", "https://*/*"] });
  for (const tab of tabs) {
    chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["watcher.js"] }).catch(() => {
      /* a page that doesn't allow it, such as the browser's own store pages */
    });
  }
});
