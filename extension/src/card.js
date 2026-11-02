// Runs on every web page, next to watcher.js. Shows the small "Save this login?" card on the page
// itself when the background part has decided one is worth offering, and passes your answer back.
// The card never holds a password: it only shows the site and the name.
//
// It waits until the login seems to have worked (no password field left on the page), so a wrong
// password that brings the login form back isn't offered for saving.

(function () {
  const STYLE = `
    :host { all: initial; }
    .card {
      --paper: #eef0ea; --ink: #17231f; --muted: #566660; --rule: #b9c4bc; --accent: #0e6b5e; --accent-ink: #ffffff;
      position: fixed; top: 16px; right: 16px; z-index: 2147483647; box-sizing: border-box;
      width: min(360px, calc(100vw - 32px)); padding: 12px 16px 8px;
      color: var(--ink); background: var(--paper);
      border: 1.5px solid var(--rule); border-left: 5px solid var(--accent); border-radius: 6px;
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.35);
      font: 15px/1.45 "Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      .card { --paper: #131a17; --ink: #e3e9e5; --muted: #94a39b; --rule: #3a4741; --accent: #5fc4b0; --accent-ink: #0b1411; }
    }
    .brand { margin: 0 0 2px; color: var(--muted); font-size: 12px; letter-spacing: 0.04em; }
    h2 { margin: 0 0 4px; font-size: 16px; font-weight: 700; }
    p { margin: 0 0 8px; font-size: 14px; overflow-wrap: anywhere; }
    .row { display: flex; flex-wrap: wrap; align-items: center; gap: 0 16px; }
    button { font: inherit; cursor: pointer; min-height: 44px; }
    button.primary { padding: 0 20px; color: var(--accent-ink); font-weight: 600; background: var(--accent); border: 0; border-radius: 10px; }
    button.link { padding: 0 4px; color: var(--accent); background: none; border: 0; text-decoration: underline; text-underline-offset: 3px; }
    button:disabled { opacity: 0.6; cursor: progress; }
    button:focus-visible { outline: 3px solid #e0a800; outline-offset: 2px; }
  `;

  let host = null; // the element on the page that holds the card
  let waiting = null; // timer while we wait for the login to look finished

  const visible = (input) => {
    const box = input.getBoundingClientRect();
    const style = getComputedStyle(input);
    return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };

  function close() {
    clearInterval(waiting);
    waiting = null;
    if (host) host.remove();
    host = null;
  }

  function say(root, heading, text) {
    root.querySelector("h2").textContent = heading;
    root.querySelector("p").textContent = text;
  }

  function render(offer) {
    close();
    host = document.createElement("passkeppler-card");
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = STYLE;

    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-label", "passkeppler: a login was noticed");

    const brand = Object.assign(document.createElement("div"), { className: "brand", textContent: "passkeppler" });
    const heading = document.createElement("h2");
    const text = document.createElement("p");
    const row = Object.assign(document.createElement("div"), { className: "row" });
    const yes = Object.assign(document.createElement("button"), { type: "button", className: "primary" });
    const no = Object.assign(document.createElement("button"), { type: "button", className: "link", textContent: "Not now" });
    row.append(yes, no);
    card.append(brand, heading, text, row);
    root.append(style, card);

    const who = `${offer.host}, as ${offer.username}`;
    const did = offer.signup ? "signed up at" : "signed in to";
    const note = offer.others ? ` You have ${offer.others} other saved login${offer.others === 1 ? "" : "s"} for this site.` : "";
    const named = `“${offer.title || "Untitled"}”`;
    if (offer.kind === "locked") {
      heading.textContent = "Unlock to save this login";
      text.textContent = `You ${did} ${who}. Unlock passkeppler and it will check whether this needs saving.`;
      yes.textContent = "Unlock";
    } else if (offer.kind === "update") {
      heading.textContent = "Update the saved password?";
      text.textContent = `You ${did} ${who} with a different password from the one saved in ${named}. Replace the saved one?`;
      yes.textContent = "Update";
    } else if (offer.kind === "same") {
      heading.textContent = "Already saved";
      text.textContent = `You ${did} ${who}. This login is already in your vault as ${named}. Nothing to change.`;
      yes.textContent = "OK";
      no.remove();
    } else {
      heading.textContent = "Save this login?";
      text.textContent = `You ${did} ${who}. It isn't in your vault yet.${note}`;
      yes.textContent = "Save";
    }

    // Clicks made by the page's own code don't count: only a real click by you does.
    let failed = false;
    yes.addEventListener("click", async (event) => {
      if (!event.isTrusted) return;
      yes.disabled = no.disabled = true;
      let reply;
      if (offer.kind === "same") {
        try {
          chrome.runtime.sendMessage({ type: "passkeppler.answer", action: "dismiss" }).catch(() => {});
        } catch {
          /* the extension was reloaded or removed while this page was open */
        }
        return close();
      }
      if (offer.kind === "locked") {
        // Only the extension's own window may ask for the master password, never this page.
        try {
          reply = await chrome.runtime.sendMessage({ type: "passkeppler.answer", action: "unlock" });
        } catch {
          /* handled below */
        }
        say(card, "Waiting for you to unlock", (reply && reply.ok) ? "Type your master password in the passkeppler window. This card will then ask to save." : (reply && reply.message) || "Click the passkeppler icon in your toolbar and unlock it. This card will then ask to save.");
        yes.remove();
        no.disabled = false;
        return;
      }
      try {
        reply = await chrome.runtime.sendMessage({ type: "passkeppler.answer", action: "accept" });
      } catch {
        /* handled below */
      }
      if (reply && reply.ok) {
        say(card, "Done", reply.message || "Saved to your vault.");
        row.remove();
        setTimeout(close, 2500);
      } else {
        say(card, "Couldn't save", (reply && reply.message) || "Open passkeppler from the toolbar and save it there.");
        failed = true; // leave the login waiting, so the popup can still save it
        yes.remove();
        no.disabled = false;
        no.textContent = "Close";
      }
    });
    no.addEventListener("click", (event) => {
      if (!event.isTrusted) return;
      try {
        if (!failed) chrome.runtime.sendMessage({ type: "passkeppler.answer", action: "dismiss" }).catch(() => {});
      } catch {
        /* the extension was reloaded or removed while this page was open */
      }
      close();
    });

    (document.body || document.documentElement).append(host);
  }

  function present(offer) {
    close();
    const started = Date.now();
    waiting = setInterval(() => {
      if (Date.now() - started > 30000) return close(); // gave up; the icon's badge is still there
      if (Date.now() - started < 800 || !document.body) return;
      if ([...document.querySelectorAll("input[type=password]")].some(visible)) return; // still on the login form
      render(offer);
    }, 300);
  }

  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message) return;
      if (message.type === "passkeppler.offer" && message.offer) present(message.offer);
      if (message.type === "passkeppler.close") close();
    });
    // A login usually changes the page, so ask whether there is an offer waiting for this tab.
    chrome.runtime.sendMessage({ type: "passkeppler.hello" }).then(
      (reply) => {
        if (reply && reply.offer) present(reply.offer);
      },
      () => {}
    );
  } catch {
    /* the extension was reloaded or removed while this page was open */
  }
})();
