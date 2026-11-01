// Extension-only behaviour, loaded after the web app's own code.
// In the popup: tell the vault which site is open, let it fill in the login form, and offer to
// save or update a login that was noticed on the open tab (see watcher.js and background.js).

import { setPage, watchList, saveNoticed, tell } from "./js/vault.js";
import { el, icon } from "./js/ui.js";
import { decide, newEntryFrom } from "./offer.js";

const popup = new URLSearchParams(location.search).get("view") === "popup";
document.body.classList.toggle("is-popup", popup);

// Runs inside the web page. It has to be self-contained, so it uses nothing from this file.
function fillLoginForm(username, password) {
  const usable = (input) => {
    const box = input.getBoundingClientRect();
    const style = getComputedStyle(input);
    return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none" && !input.disabled && !input.readOnly;
  };
  const type = (input) => (input.getAttribute("type") || "text").toLowerCase();
  const set = (input, value) => {
    // Sites built with frameworks only notice a change made the way a person's typing would.
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const inputs = [...document.querySelectorAll("input")].filter(usable);
  const passwordField = inputs.find((input) => type(input) === "password");
  const textFields = inputs.filter((input) => ["text", "email", "tel"].includes(type(input)));

  let userField = null;
  if (passwordField) {
    // The closest text field before the password field.
    const before = textFields.filter((input) => input.compareDocumentPosition(passwordField) & Node.DOCUMENT_POSITION_FOLLOWING);
    userField = before[before.length - 1] || null;
  } else {
    // A first step that only asks for the username or email.
    userField = textFields.find((input) => type(input) === "email" || /user|email|login|account/i.test([input.autocomplete, input.name, input.id].join(" "))) || null;
  }

  const filled = { user: false, password: false };
  if (userField && username) {
    set(userField, username);
    filled.user = true;
  }
  if (passwordField && password) {
    set(passwordField, password);
    filled.password = true;
  }
  return filled;
}

// ---- A login noticed on this tab ----

const PENDING = "passkeppler.pending"; // { tabId: { host, origin, username, password } }, kept by background.js

let tabId = null;
let pending = null; // the login noticed on this tab, until it is saved or put aside
let reminder = null; // an "already saved" note, shown once and then forgotten
let shown = ""; // which card is on screen, so the list being redrawn doesn't rebuild it
const card = el("div", { class: "offer", role: "region", "aria-label": "A login noticed on this page", hidden: true });

function resetBadge(id) {
  chrome.action.setBadgeText({ tabId: id, text: "" }).catch(() => {});
  chrome.action.setTitle({ tabId: id, title: "passkeppler" }).catch(() => {});
}

async function forget(ids) {
  const all = (await chrome.storage.session.get(PENDING))[PENDING] || {};
  for (const id of ids || Object.keys(all)) {
    delete all[id];
    resetBadge(Number(id));
  }
  await chrome.storage.session.set({ [PENDING]: all });
}

function putAside() {
  pending = null;
  reminder = null;
  forget([tabId]);
  drawCard(null);
}

function drawCard(offer) {
  const key = offer ? offer.kind + (offer.entry ? offer.entry.id + ":" + offer.entry.updatedAt : "") : "";
  if (key === shown) return;
  shown = key;
  card.hidden = !offer;
  if (!offer) return card.replaceChildren();

  const login = offer.login;
  const who = `${login.host}, as ${login.username}`;
  const title = offer.entry ? `“${offer.entry.title || "Untitled"}”` : "";
  let heading, text, yes;
  if (offer.kind === "save") {
    heading = "Save this login?";
    text = `You signed in to ${who}. It isn't in your vault yet.`;
    yes = "Save";
  } else if (offer.kind === "update") {
    heading = "Update the saved password?";
    text = `You signed in to ${who} with a different password from the one saved in ${title}. Replace the saved one?`;
    yes = "Update";
  } else {
    heading = "Already saved";
    text = `You signed in to ${who}. This login is already in your vault as ${title}. Nothing to change.`;
    yes = "OK";
  }

  const yesButton = el("button", { type: "button" }, yes);
  yesButton.addEventListener("click", async () => {
    if (offer.kind === "same") return putAside();
    yesButton.disabled = true;
    pending = null; // so redrawing the list while saving doesn't offer it again
    try {
      await saveNoticed(offer.kind === "update" ? { id: offer.entry.id, password: login.password } : newEntryFrom(login));
    } catch {
      pending = login;
      yesButton.disabled = false;
      tell("Couldn't save this login. Try again.", true);
      return;
    }
    putAside();
    tell(offer.kind === "update" ? "Password updated." : "Saved to your vault.");
  });

  card.replaceChildren(
    el("h3", {}, heading),
    el("p", {}, text),
    el("div", { class: "actions" }, yesButton, offer.kind === "same" ? null : el("button", { type: "button", class: "link", onclick: putAside }, "Not now"))
  );
}

// Called each time the vault list is drawn, because what to offer depends on what is in the vault.
function checkOffer(entries) {
  if (reminder) return drawCard(reminder);
  if (!pending) return drawCard(null);
  const offer = { ...decide(pending, entries), login: pending };
  if (offer.kind === "same") {
    // Only a reminder: shown now, and not kept for next time.
    reminder = offer;
    pending = null;
    forget([tabId]);
  }
  drawCard(offer);
}

// Pressing Lock also throws away anything noticed on any tab.
document.getElementById("lock").addEventListener("click", () => {
  pending = null;
  reminder = null;
  drawCard(null);
  forget();
});

async function start() {
  if (!popup) return;

  // "Open in a tab" gives Import and Restore room to work, and a full-size page.
  const tabLink = document.createElement("button");
  tabLink.type = "button";
  tabLink.className = "tool";
  tabLink.append(icon("tab"), Object.assign(document.createElement("span"), { textContent: "Open in tab" }));
  tabLink.setAttribute("aria-label", "Open in a tab");
  tabLink.addEventListener("click", async () => {
    await chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
    window.close();
  });
  document.querySelector("nav.tools").append(tabLink);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) {
    tabId = tab.id;
    pending = ((await chrome.storage.session.get(PENDING))[PENDING] || {})[tab.id] || null;
    document.getElementById("pane-list").prepend(card);
    watchList(checkOffer);
  }

  let host = "";
  try {
    const url = new URL(tab.url);
    if (url.protocol === "https:" || url.protocol === "http:") host = url.host.replace(/^www\./, "");
  } catch {
    /* a browser page: nothing to fill */
  }
  if (!host) return;

  // Whether the page is being watched for logins, so a miss can be told apart from "not looking".
  const watching = el("p", { class: "watching" });
  card.after(watching); // under the offer, if there is one
  chrome.tabs.sendMessage(tab.id, { type: "passkeppler.ping" }).then(
    async () => {
      const why = ((await chrome.storage.session.get("passkeppler.skipped"))["passkeppler.skipped"] || {})[tab.id];
      watching.textContent = why ? `Watching this page. The last form here was skipped because ${why}.` : "Watching this page for logins.";
    },
    () => (watching.textContent = "Not watching this page yet. Reload it once.")
  );

  setPage({
    host,
    async fill(entry) {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: fillLoginForm,
        args: [entry.username || entry.email || "", entry.password || ""],
      });
      if (result && (result.user || result.password)) window.close();
      return result;
    },
  });
}

start();
