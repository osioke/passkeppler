// Small helpers shared by the screens.

// Builds an element. Text is always added as text (never as HTML), so nothing
// typed into an entry can run as code.
export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === false || value == null) continue;
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) {
    if (child != null && child !== false) node.append(child);
  }
  return node;
}

// ---- Show / hide for password-type fields ----
// Any <input data-reveal> gets a Show/Hide button at its end.

const revealers = [];

export function addRevealToggle(input) {
  const label = document.querySelector(`label[for="${input.id}"]`).textContent.trim().toLowerCase();
  const button = document.createElement("button");
  button.type = "button";
  button.className = "link reveal";
  button.setAttribute("aria-controls", input.id);

  const set = (visible) => {
    input.type = visible ? "text" : "password";
    button.textContent = visible ? "Hide" : "Show";
    button.setAttribute("aria-pressed", String(visible));
    button.setAttribute("aria-label", (visible ? "Hide " : "Show ") + label);
  };

  button.addEventListener("click", (event) => {
    set(input.type === "password");
    // Mouse and touch: stay in the field. Keyboard: leave focus on the button.
    if (event.detail > 0) input.focus();
  });

  input.after(button);
  set(false);
  revealers.push(() => set(false));
}

export function hideAllPasswords() {
  for (const reset of revealers) reset();
}

export function setupRevealToggles() {
  document.querySelectorAll("input[data-reveal]").forEach(addRevealToggle);
}

// ---- Clipboard ----

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
