// Keeps the unlock for the rest of the browser session, so the popup doesn't ask for the
// master password every time it opens. chrome.storage.session lives in memory only: it is
// emptied when the browser closes, and it can't be read by web pages. Lock empties it too.

export const enabled = true;

const KEY = "passkeppler.session";

const toBase64 = (buffer) => btoa(String.fromCharCode(...new Uint8Array(buffer)));
const fromBase64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

export async function save({ email, authPassword, encKey }) {
  const raw = await crypto.subtle.exportKey("raw", encKey);
  await chrome.storage.session.set({ [KEY]: { email, authPassword, key: toBase64(raw) } });
}

export async function load() {
  const saved = (await chrome.storage.session.get(KEY))[KEY];
  if (!saved) return null;
  // Back to a key that can't be exported again.
  const encKey = await crypto.subtle.importKey("raw", fromBase64(saved.key), "AES-GCM", false, ["encrypt", "decrypt"]);
  return { email: saved.email, authPassword: saved.authPassword, encKey };
}

export async function clear() {
  await chrome.storage.session.remove(KEY);
}
