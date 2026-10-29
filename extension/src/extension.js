// Extension-only behaviour, loaded after the web app's own code.
// In the popup: tell the vault which site is open, and let it fill in the login form.

import { setPage } from "./js/vault.js";

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

async function start() {
  if (!popup) return;

  // "Open in a tab" gives Import and Restore room to work, and a full-size page.
  const tabLink = document.createElement("button");
  tabLink.type = "button";
  tabLink.className = "link";
  tabLink.textContent = "Open in a tab";
  tabLink.addEventListener("click", async () => {
    await chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
    window.close();
  });
  document.querySelector("nav.tools").append(tabLink);

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = "";
  try {
    const url = new URL(tab.url);
    if (url.protocol === "https:" || url.protocol === "http:") host = url.host.replace(/^www\./, "");
  } catch {
    /* a browser page: nothing to fill */
  }
  if (!host) return;

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
