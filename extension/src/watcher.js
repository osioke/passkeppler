// Runs on every web page. When a login form is submitted, it tells the background part of the
// extension which username and password were typed. It reads nothing else on the page, and
// what it sees is only ever passed to this extension.
//
// Stage 1: a normal login form (username and password on one page, with a real submit).

(function () {
  const seen = (input) => {
    const box = input.getBoundingClientRect();
    const style = getComputedStyle(input);
    return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };

  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      // passkeppler's own unlock page: the master password must never be offered for saving.
      if (form.id === "auth-form" && document.getElementById("view-vault")) return;

      const inputs = [...form.elements].filter((input) => input instanceof HTMLInputElement && seen(input));

      // A login form has exactly one password field. Two or more means signing up or changing a
      // password, which comes in a later stage.
      const passwords = inputs.filter((input) => input.type === "password");
      if (passwords.length !== 1 || !passwords[0].value) return;
      const password = passwords[0];

      // The closest filled-in text or email field above the password.
      const above = inputs.filter(
        (input) =>
          ["text", "email", "tel"].includes(input.type) &&
          input.value.trim() &&
          input.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING
      );
      const user = above[above.length - 1];
      if (!user) return;

      try {
        chrome.runtime.sendMessage({ type: "passkeppler.noticed", username: user.value.trim(), password: password.value }).catch(() => {});
      } catch {
        /* the extension was reloaded or removed while this page was open */
      }
    },
    true // capture: see the form before the page's own code can stop it
  );
})();
