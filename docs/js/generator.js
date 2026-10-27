// Password generator: random characters, or a phrase of random words.
// Uses the browser's secure random numbers, never Math.random.

import { WORDS } from "./wordlist.js";
import { el, copyText } from "./ui.js";

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const SPECIAL = "!@#$%^&*-_=+?.,:;";

export const LIMITS = { length: [8, 128], words: [3, 12] };

// A fair random whole number from 0 to max - 1 (no bias towards small numbers).
export function randomInt(max) {
  const limit = Math.floor(0x100000000 / max) * max;
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return buffer[0] % max;
}

const pick = (text) => text[randomInt(text.length)];

function shuffle(list) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export const clamp = (value, min, max) => Math.min(max, Math.max(min, Math.round(Number(value)) || min));

// Exactly `specialCount` special characters, and always at least one lowercase
// letter, one capital and one digit.
export function generateCharacters({ length = 20, specialCount = 0 } = {}) {
  length = clamp(length, ...LIMITS.length);
  specialCount = Math.min(Math.max(0, Math.round(Number(specialCount)) || 0), length - 3);
  const chars = [];
  for (let i = 0; i < specialCount; i++) chars.push(pick(SPECIAL));
  chars.push(pick(LOWER), pick(UPPER), pick(DIGITS));
  const rest = LOWER + UPPER + DIGITS;
  while (chars.length < length) chars.push(pick(rest));
  return shuffle(chars).join("");
}

export function generatePhrase({ words = 6, separator = "-" } = {}) {
  words = clamp(words, ...LIMITS.words);
  const chosen = [];
  for (let i = 0; i < words; i++) chosen.push(WORDS[randomInt(WORDS.length)]);
  return chosen.join(separator);
}

// ---- Screen ----

let instance = 0;

// Fills `root` with the generator. onUse (optional) adds a "Use this password" button.
export function mountGenerator(root, { onUse } = {}) {
  const n = instance++;
  const id = (name) => `g${n}-${name}`;

  const modeChars = el("input", { type: "radio", name: id("mode"), id: id("mode-chars"), checked: true });
  const modePhrase = el("input", { type: "radio", name: id("mode"), id: id("mode-phrase") });

  const length = el("input", { type: "number", id: id("length"), inputmode: "numeric", min: LIMITS.length[0], max: LIMITS.length[1], step: 1, value: 20, class: "num" });
  const useSpecial = el("input", { type: "checkbox", id: id("special"), checked: true });
  const specialCount = el("input", { type: "number", id: id("special-count"), inputmode: "numeric", min: 1, step: 1, value: 4, class: "num" });
  const words = el("input", { type: "number", id: id("words"), inputmode: "numeric", min: LIMITS.words[0], max: LIMITS.words[1], step: 1, value: 6, class: "num" });
  const separator = el(
    "select",
    { id: id("separator") },
    [["-", "Hyphen (-)"], [".", "Dot (.)"], ["_", "Underscore (_)"], [" ", "Space"], ["", "Nothing"]].map(([value, label]) => el("option", { value }, label))
  );

  const note = el("p", { class: "help", id: id("note") });
  const charsBox = el(
    "div",
    { class: "gen-options" },
    el("label", { for: id("length") }, "Length"),
    length,
    el("label", { class: "check", for: id("special") }, useSpecial, " Include special characters"),
    el("label", { for: id("special-count") }, "How many special characters"),
    specialCount
  );
  const phraseBox = el(
    "div",
    { class: "gen-options", hidden: true },
    el("label", { for: id("words") }, "Number of words"),
    words,
    el("label", { for: id("separator") }, "Separator"),
    separator
  );

  const output = el("textarea", {
    id: id("output"),
    class: "gen-output",
    readonly: true,
    rows: 2,
    spellcheck: "false",
    autocomplete: "off",
    autocapitalize: "none",
    autocorrect: "off",
  });
  output.addEventListener("focus", () => output.select());
  const status = el("p", { class: "help", role: "status" });

  const phrase = () => modePhrase.checked;

  // Keeps a number inside its limits, and says so instead of quietly changing it.
  function fit(input, min, max, what) {
    const wanted = Number(input.value);
    const fitted = clamp(wanted, min, max);
    if (wanted !== fitted) {
      input.value = fitted;
      note.textContent = `${what} can be ${min} to ${max}, so it was set to ${fitted}.`;
    }
    return fitted;
  }

  function make(message = "New password ready.") {
    note.textContent = "";
    charsBox.hidden = phrase();
    phraseBox.hidden = !phrase();
    if (phrase()) {
      fit(words, ...LIMITS.words, "The number of words");
      output.value = generatePhrase({ words: words.value, separator: separator.value });
    } else {
      const total = fit(length, ...LIMITS.length, "The length");
      specialCount.disabled = !useSpecial.checked;
      specialCount.max = total - 3;
      const special = useSpecial.checked ? fit(specialCount, 1, total - 3, "The number of special characters") : 0;
      output.value = generateCharacters({ length: total, specialCount: special });
    }
    status.textContent = message;
  }

  for (const control of [modeChars, modePhrase, useSpecial, separator, length, specialCount, words]) {
    control.addEventListener("change", () => make());
  }

  // Inside the entry form, Enter must not save the entry. It makes a new password instead.
  root.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.target.tagName === "INPUT" || event.target.tagName === "SELECT")) {
      event.preventDefault();
      make();
    }
  });

  const again = el("button", { type: "button", class: "link", onclick: () => make() }, "Make another");
  const copy = el(
    "button",
    {
      type: "button",
      class: "link",
      onclick: async () => {
        status.textContent = (await copyText(output.value)) ? "Copied." : "Couldn't copy. Select the password and copy it yourself.";
      },
    },
    "Copy"
  );
  const useButton = onUse ? el("button", { type: "button", onclick: () => onUse(output.value) }, "Use this password") : null;

  root.replaceChildren(
    el(
      "fieldset",
      { class: "gen-mode" },
      el("legend", {}, "Type"),
      el("label", { class: "check", for: id("mode-chars") }, modeChars, " Random characters"),
      el("label", { class: "check", for: id("mode-phrase") }, modePhrase, " Words")
    ),
    charsBox,
    phraseBox,
    note,
    el("label", { for: id("output") }, "Password"),
    output,
    el("div", { class: "actions" }, useButton, again, copy),
    status
  );
  make("");
  return { regenerate: () => make(""), value: () => output.value };
}
