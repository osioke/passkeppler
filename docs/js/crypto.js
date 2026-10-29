// Turns the master password into two separate values, and encrypts/decrypts entries.
// Uses only the browser's built-in Web Crypto, so there is nothing to install.
//
//   master password + email  ->  masterKey  (PBKDF2, slow on purpose)
//   masterKey                ->  authPassword  (sent to Firebase as the login password)
//   masterKey                ->  encKey        (never leaves this device, encrypts the vault)

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const KDF_ITERATIONS = 600000;

export function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function toBase64(buffer) {
  let binary = "";
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text) {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// extractable is false everywhere except the browser extension, which keeps the key for
// the length of a browser session (see session.js).
export async function deriveKeys(email, masterPassword, iterations = KDF_ITERATIONS, extractable = false) {
  // The email is part of the salt, so nothing has to be fetched before logging in.
  const salt = encoder.encode("passkeppler:v1:" + email.trim().toLowerCase());
  const password = encoder.encode(masterPassword.normalize("NFKC"));

  const baseKey = await crypto.subtle.importKey("raw", password, "PBKDF2", false, ["deriveBits"]);
  const masterBits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    baseKey,
    256
  );

  const hkdfKey = await crypto.subtle.importKey("raw", masterBits, "HKDF", false, ["deriveBits", "deriveKey"]);
  const noSalt = new Uint8Array(0);

  const authBits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: noSalt, info: encoder.encode("passkeppler-auth") },
    hkdfKey,
    256
  );

  const encKey = await crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: noSalt, info: encoder.encode("passkeppler-enc") },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    extractable, // normally cannot be exported from the browser
    ["encrypt", "decrypt"]
  );

  return { authPassword: toHex(authBits), encKey };
}

// Encrypts any JSON-friendly value. Returns { iv, ct } as text, ready to store.
export async function encryptJSON(encKey, value) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = encoder.encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, encKey, data);
  return { iv: toBase64(iv), ct: toBase64(ct) };
}

// Throws if the key is wrong or the data was changed.
export async function decryptJSON(encKey, { iv, ct }) {
  const data = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64(iv) }, encKey, fromBase64(ct));
  return JSON.parse(decoder.decode(data));
}
