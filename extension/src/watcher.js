// Runs on every web page, from the very start of the page. When a login is attempted, it tells
// the background part of the extension which username and password were typed. It reads nothing
// else on the page, and what it sees is only ever passed to this extension.
//
// Stages 1 to 4: a normal login form (username and password on one page), a sign-up form
// (email, maybe a username, a new password and often a "confirm" copy of it), and a two-step login
// (the username on one step, the password on the next; the background part joins the two). A login counts when the
// form is submitted, when its submit button is pressed, or when Enter is pressed in the password
// field. Sites differ in which of these actually happens, so all three are watched. The same
// login seen twice within a few seconds is only sent once.
//
// Stage 4: many sites have no <form> at all (the page's own script sends the login in the
// background and changes the page without reloading). There, a click on a button or Enter in a
// field counts too, and the "form" is the smallest part of the page that holds the password box.

(function () {
  const seen = (input) => {
    const box = input.getBoundingClientRect();
    const style = getComputedStyle(input);
    return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };

  let sent = { key: "", at: 0 };

  // Tells the background why a form was not noticed (no passwords or names), so the popup can
  // say so. It is kept there because the page often changes straight after a login.
  function skip(reason) {
    try {
      chrome.runtime.sendMessage({ type: "passkeppler.skipped", reason }).catch(() => {});
    } catch {
      /* the extension was reloaded or removed while this page was open */
    }
  }

  function send(message) {
    try {
      chrome.runtime.sendMessage(message).catch(() => {});
    } catch {
      /* the extension was reloaded or removed while this page was open */
    }
  }

  // The first step of a two-step login: only a username or email is asked for. We just remember it
  // (in the background part, because the page usually changes before the password step).
  function firstStep(inputs) {
    const fields = inputs.filter((input) => ["text", "email", "tel"].includes(input.type) && input.value.trim());
    if (!fields.length || fields.length > 2) return;
    const field = fields.find(
      (input) =>
        input.type === "email" ||
        /username|email|tel/.test(input.autocomplete) ||
        /user|e-?mail|login|account|phone|identifier/i.test(input.name + " " + input.id + " " + input.placeholder)
    );
    if (field) send({ type: "passkeppler.firstStep", username: field.value.trim() });
  }

  // For a page with no <form>: the smallest part of the page around this element that holds a
  // visible password box (and so the name above it). Null if there is none.
  function areaAround(element) {
    for (let box = element; box && box !== document.documentElement; box = box.parentElement) {
      if ([...box.querySelectorAll("input[type=password]")].some(seen)) return box;
    }
    return null;
  }

  // Buttons that only show the password or lead somewhere else are not a login.
  const notLogin = /show|hide|reveal|toggle|eye|forgot|reset|visib/i;

  function look(form) {
    // passkeppler's own unlock page: the master password must never be offered for saving.
    if (form.id === "auth-form" && document.getElementById("view-vault")) return;

    const all = form instanceof HTMLFormElement ? [...form.elements] : [...form.querySelectorAll("input")];
    const inputs = all.filter((input) => input instanceof HTMLInputElement && seen(input));

    // One password field is a login. Two with the same text in them is a sign-up (new password and
    // "confirm"). Anything else, like current + new password, is a change-password form: later.
    const passwords = inputs.filter((input) => input.type === "password");
    if (!passwords.length) return firstStep(inputs); // maybe the first step of a two-step login
    if (passwords.length > 2) return skip("it has three or more password fields, like a change-password form");
    if (passwords.length === 2 && passwords[0].value !== passwords[1].value) {
      return skip("it has two different password fields, like a change-password form");
    }
    const password = passwords[0];
    if (!password.value) return skip("the password field was empty");

    const signup = passwords.length === 2 || /new-password/.test(password.autocomplete);

    // Filled-in text and email fields above the password.
    const above = inputs.filter(
      (input) =>
        ["text", "email", "tel"].includes(input.type) &&
        input.value.trim() &&
        input.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING
    );

    let username = "";
    let email = "";
    if (signup) {
      // A sign-up has other fields too (first name, phone...), so pick the email and username by what they are.
      const mail =
        above.find((input) => input.type === "email" || /email/.test(input.autocomplete)) ||
        above.find((input) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim()));
      const named = above.find(
        (input) =>
          input !== mail && (/username|nickname/.test(input.autocomplete) || /user(name)?|login|handle|nick|screen.?name/i.test(input.name + " " + input.id))
      );
      email = mail ? mail.value.trim() : "";
      username = named ? named.value.trim() : email;
      if (!username) return skip("there was no email or username above the new password");
    } else {
      // The closest filled-in field above the password.
      const user = above[above.length - 1];
      // No username on this step: maybe the second step of a two-step login. The background part
      // knows the first step, so it decides.
      username = user ? user.value.trim() : "";
    }

    const key = username + "\n" + email + "\n" + password.value;
    if (key === sent.key && Date.now() - sent.at < 3000) return;
    sent = { key, at: Date.now() };
    send({ type: "passkeppler.noticed", username, email, password: password.value, signup, secondStep: !username });
  }

  // Capture: see it before the page's own code can stop it or clear the fields.
  document.addEventListener("submit", (event) => {
    if (event.target instanceof HTMLFormElement) look(event.target);
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target && target.closest("button, input[type=submit], input[type=image], input[type=button], [role=button]");
    if (!button) return;
    if (button.form) {
      const type = (button.getAttribute("type") || "submit").toLowerCase();
      if (type === "submit" || type === "image") look(button.form); // not "Show password" and other plain buttons
    } else if (!button.closest("form")) {
      // No form: any button next to a password box, unless it is a "show password" or "forgot" button.
      if (notLogin.test(button.textContent + " " + (button.getAttribute("aria-label") || "") + " " + button.id + " " + button.className + " " + (button.value || ""))) return;
      const area = areaAround(button);
      if (area) look(area);
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    const field = event.target;
    if (event.key !== "Enter" || !(field instanceof HTMLInputElement) || !["password", "text", "email", "tel"].includes(field.type)) return;
    const area = field.form || (field.closest("form") ? null : areaAround(field));
    if (area) look(area);
  }, true);

  // "Sign in with Google" and similar. Which sign-in service a button or link stands for, or "".
  // Judged by its short visible text or label, or by where it points. Bare logos with no label,
  // and buttons inside other sites' frames (like Google's own button), can't be recognised.
  const NAMES = "Google|Facebook|Apple|GitHub|Microsoft|Twitter|LinkedIn|Amazon|Discord|Yahoo";
  const phrase = new RegExp("(?:sign|log)\\s?-?\\s?(?:in|up|on)\\s+(?:in\\s+)?(?:with|using|via|through)\\s+(?:your\\s+)?(" + NAMES + ")\\b|continue\\s+(?:with|using)\\s+(?:your\\s+)?(" + NAMES + ")\\b|(?:login|signin|signup)\\s+(?:with|using|via)\\s+(" + NAMES + ")\\b", "i");
  const places = [
    [/(^|\.)accounts\.google\.com$/, "Google"], [/(^|\.)facebook\.com$/, "Facebook"], [/(^|\.)appleid\.apple\.com$/, "Apple"],
    [/^github\.com$/, "GitHub"], [/^login\.microsoftonline\.com$|^login\.live\.com$/, "Microsoft"], [/(^|\.)linkedin\.com$/, "LinkedIn"],
    [/^discord\.com$/, "Discord"], [/^(api\.)?twitter\.com$|^x\.com$/, "Twitter"], [/^www\.amazon\.com$|^amazon\.com$/, "Amazon"], [/^login\.yahoo\.com$/, "Yahoo"],
  ];
  function providerOf(element) {
    const own = location.host.replace(/^www\./, "");
    for (let el = element, depth = 0; el && el !== document.body && depth < 4; el = el.parentElement, depth++) {
      const text = (el.textContent || "").trim();
      const label = [el.getAttribute("aria-label"), el.getAttribute("title"), el.value, text.length <= 60 ? text : ""].join(" ");
      const found = label.match(phrase);
      if (found) return found.slice(1).find(Boolean).replace(/^./, (c) => c.toUpperCase()).replace(/^Github$/i, "GitHub").replace(/^Linkedin$/i, "LinkedIn");
      if (el.tagName === "A" && el.href && /oauth|authorize|\/auth\b|\/login|signin|sso/i.test(el.href)) {
        try {
          const target = new URL(el.href).host;
          const hit = places.find(([pattern]) => pattern.test(target) && target.replace(/^www\./, "") !== own);
          if (hit) return hit[1];
        } catch {
          /* not a real address */
        }
      }
    }
    return "";
  }
  // card.js (same page, same sandbox) asks this to know whether a sign-in button is still showing.
  globalThis.passkepplerProviderShowing = () =>
    [...document.querySelectorAll("button, a, [role=button], input[type=submit], input[type=button], input[type=image]")].some((el) => seen(el) && providerOf(el));

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const clicked = target && target.closest("button, a, [role=button], input[type=submit], input[type=button], input[type=image]");
    const provider = clicked && providerOf(clicked);
    if (provider) send({ type: "passkeppler.provider", provider });
  }, true);

  // The popup asks this, so it can say whether the page is being watched.
  try {
    chrome.runtime.onMessage.addListener((message, sender, reply) => {
      if (message && message.type === "passkeppler.ping") reply({ watching: true });
    });
  } catch {
    /* the extension was reloaded or removed while this page was open */
  }
})();
