// Runs on every web page, from the very start of the page. When a login is attempted, it tells
// the background part of the extension which username and password were typed. It reads nothing
// else on the page, and what it sees is only ever passed to this extension.
//
// Stages 1 and 2: a normal login form (username and password on one page) and a sign-up form
// (email, maybe a username, a new password and often a "confirm" copy of it). A login counts when the
// form is submitted, when its submit button is pressed, or when Enter is pressed in the password
// field. Sites differ in which of these actually happens, so all three are watched. The same
// login seen twice within a few seconds is only sent once.

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

  function look(form) {
    // passkeppler's own unlock page: the master password must never be offered for saving.
    if (form.id === "auth-form" && document.getElementById("view-vault")) return;

    const inputs = [...form.elements].filter((input) => input instanceof HTMLInputElement && seen(input));

    // One password field is a login. Two with the same text in them is a sign-up (new password and
    // "confirm"). Anything else, like current + new password, is a change-password form: later.
    const passwords = inputs.filter((input) => input.type === "password");
    if (!passwords.length) return; // not a login form at all (a search box, say)
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
      if (!user) return skip("there was no filled-in username or email above the password");
      username = user.value.trim();
    }

    const key = username + "\n" + email + "\n" + password.value;
    if (key === sent.key && Date.now() - sent.at < 3000) return;
    sent = { key, at: Date.now() };
    try {
      chrome.runtime.sendMessage({ type: "passkeppler.noticed", username, email, password: password.value, signup }).catch(() => {});
    } catch {
      /* the extension was reloaded or removed while this page was open */
    }
  }

  // Capture: see it before the page's own code can stop it or clear the fields.
  document.addEventListener("submit", (event) => {
    if (event.target instanceof HTMLFormElement) look(event.target);
  }, true);

  document.addEventListener("click", (event) => {
    const button = event.target instanceof Element && event.target.closest("button, input[type=submit], input[type=image]");
    if (!button || !button.form) return;
    const type = (button.getAttribute("type") || "submit").toLowerCase();
    if (type === "submit" || type === "image") look(button.form); // not "Show password" and other plain buttons
  }, true);

  document.addEventListener("keydown", (event) => {
    const field = event.target;
    if (event.key === "Enter" && field instanceof HTMLInputElement && field.type === "password" && field.form) look(field.form);
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
