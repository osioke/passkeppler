// Backups: one .html file holding the whole vault (scrambled with your master
// password) plus a small viewer, so it opens in any browser with no internet,
// no Firebase and no app.

import { encryptJSON, decryptJSON } from "./crypto.js";

const FORMAT = "passkeppler-backup";

export function latestChange(entries) {
  return entries.reduce((max, entry) => Math.max(max, entry.updatedAt || 0), 0);
}

export function backupFileName(now = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `passkeppler-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}.html`;
}

// Returns the text of the backup file.
export async function buildBackup({ entries, encKey, email, config }) {
  const [cryptoSource, template] = await Promise.all([
    fetch("js/crypto.js").then((r) => r.text()),
    fetch("backup-viewer.html").then((r) => r.text()),
  ]);
  const blob = await encryptJSON(encKey, { entries });
  const payload = {
    format: FORMAT,
    version: 1,
    createdAt: Date.now(),
    email,
    entryCount: entries.length,
    latestChange: latestChange(entries),
    firebaseConfig: config || null,
    iv: blob.iv,
    ct: blob.ct,
  };
  // "<" is escaped so nothing inside can end the script tag early.
  const json = JSON.stringify(payload).replace(/</g, "\\u003c");
  return template.replace("/*__CRYPTO__*/", () => cryptoSource).replace("__PAYLOAD__", () => json);
}

// Reads the plain header out of a backup file. Throws if it isn't one.
export function readBackupHeader(fileText) {
  const doc = new DOMParser().parseFromString(fileText, "text/html");
  const node = doc.getElementById("payload");
  let payload;
  try {
    payload = JSON.parse(node.textContent);
  } catch {
    throw new Error("This doesn't look like a passkeppler backup file.");
  }
  if (payload.format !== FORMAT) throw new Error("This doesn't look like a passkeppler backup file.");
  return payload;
}

// Opens the scrambled part. Throws if the key is wrong.
export async function openBackup(payload, encKey) {
  const data = await decryptJSON(encKey, { iv: payload.iv, ct: payload.ct });
  return data.entries || [];
}

// Works out what restoring would change, without changing anything.
// An entry is added if it's missing, or replaced if the backup's copy is newer.
// Nothing is ever deleted.
export function planRestore(current, fromBackup) {
  const byId = new Map(current.map((entry) => [entry.id, entry]));
  const add = [];
  const update = [];
  let same = 0;
  for (const entry of fromBackup) {
    const existing = byId.get(entry.id);
    if (!existing) add.push(entry);
    else if ((entry.updatedAt || 0) > (existing.updatedAt || 0)) update.push(entry);
    else same++;
  }
  return { add, update, same };
}
