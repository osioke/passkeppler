// The vault screens: list, search, view, add, edit and delete entries.
// Every entry is encrypted here, on this device, before it is handed to the store.

import { encryptJSON, decryptJSON } from "./crypto.js";
import * as store from "./store.js";
import { el, copyText } from "./ui.js";
import { mountGenerator } from "./generator.js";
import { mountImport } from "./import-ui.js";
import { downloadBackup, mountRestore } from "./backup-ui.js";
import { backupStatus, getReminderDays, setReminderDays } from "./prefs.js";

const $ = (id) => document.getElementById(id);

let encKey = null;
let entries = []; // decrypted, in memory only
let unreadable = 0; // stored entries this key couldn't open
let stopListening = null;
let currentId = null; // entry shown in the detail pane
let editing = null; // entry being edited, or null for a new one
let loadCounter = 0;
let noticeTimer = null;
let renderedKey = ""; // which version of the open entry is on screen

const MASK = "••••••••";

// ---- Start and stop ----

export function openVault(email, key) {
  encKey = key;
  entries = [];
  unreadable = 0;
  currentId = null;
  editing = null;
  $("who").textContent = email;
  $("search").value = "";
  $("list-summary").textContent = "Loading your vault…";
  $("entry-list").replaceChildren();
  showPane("list");

  stopListening = store.subscribeEntries(onStoredEntries, (err) => notify(store.describeError(err), true));
}

export function closeVault() {
  if (stopListening) stopListening();
  stopListening = null;
  encKey = null;
  entries = [];
  currentId = null;
  editing = null;
  $("entry-list").replaceChildren();
  $("pane-detail").replaceChildren();
  $("pane-edit").reset();
  $("custom-rows").replaceChildren();
  setGenPanel(false);
  $("generator-root").replaceChildren(); // a generated password shouldn't linger once the vault is locked
  $("pane-import").replaceChildren(); // nor imported rows, which hold passwords
  $("pane-restore").replaceChildren();
  $("backup-status").textContent = "";
  $("count").textContent = "";
  notify("");
}

async function onStoredEntries(docs) {
  const mine = ++loadCounter;
  const opened = [];
  let failed = 0;
  for (const stored of docs) {
    try {
      opened.push(normalise(await decryptJSON(encKey, stored)));
    } catch {
      failed++;
    }
  }
  if (mine !== loadCounter || !encKey) return; // a newer update arrived, or the vault was locked
  entries = opened;
  unreadable = failed;
  renderList();
  // Redraw the open entry only if it really changed, so focus and "shown" passwords aren't reset for nothing.
  if (currentId && !$("pane-detail").hidden) {
    const open = entries.find((e) => e.id === currentId);
    if (!open || versionOf(open) !== renderedKey) renderDetail();
  }
}

function versionOf(entry) {
  return entry.id + ":" + entry.updatedAt;
}

// Fills in anything missing so older or partial entries still display.
function normalise(entry) {
  return {
    id: entry.id,
    title: entry.title || "",
    url: entry.url || "",
    username: entry.username || "",
    email: entry.email || "",
    password: entry.password || "",
    notes: entry.notes || "",
    backupCodes: entry.backupCodes || "",
    customFields: Array.isArray(entry.customFields) ? entry.customFields : [],
    createdAt: entry.createdAt || 0,
    updatedAt: entry.updatedAt || 0,
  };
}

// ---- Saving ----

async function persist(entry) {
  entry.updatedAt = Date.now();
  const blob = await encryptJSON(encKey, entry);
  const stored = { id: entry.id, schemaVersion: 1, updatedAt: entry.updatedAt, ...blob };

  // Show the change straight away; Firebase confirms in the background.
  const index = entries.findIndex((e) => e.id === entry.id);
  if (index >= 0) entries[index] = entry;
  else entries.push(entry);

  store.putEntry(stored).catch((err) => notify(store.describeError(err), true));
}

// Saves several new entries at once. Resolves when they are encrypted and on this device;
// Firebase confirms in the background, and an error is shown if it refuses.
// With keepTime (restoring a backup), entries keep their own id and dates, and one that
// is already here is replaced instead of added.
async function saveMany(list, onProgress, { keepTime = false } = {}) {
  const now = Date.now();
  const saved = [];
  const stored = [];
  for (const [i, item] of list.entries()) {
    const entry = keepTime ? normalise(item) : { ...normalise(item), id: crypto.randomUUID(), createdAt: now, updatedAt: now };
    const blob = await encryptJSON(encKey, entry);
    stored.push({ id: entry.id, schemaVersion: 1, updatedAt: entry.updatedAt, ...blob });
    saved.push(entry);
    onProgress(i + 1, list.length);
  }
  for (const entry of saved) {
    const index = entries.findIndex((e) => e.id === entry.id);
    if (index >= 0) entries[index] = entry;
    else entries.push(entry);
  }
  renderList();
  store.putEntries(stored).catch((err) => notify(store.describeError(err), true));
  return saved.length;
}

// ---- Panes ----

function showPane(name) {
  for (const pane of ["list", "detail", "edit", "generator", "import", "restore", "settings"]) $("pane-" + pane).hidden = pane !== name;
  if (name === "detail") $("detail-title")?.focus();
  if (name === "edit") $("edit-title").focus();
  if (name === "generator") $("generator-title").focus();
  if (name === "settings") $("settings-title").focus();
}

// For app.js, which has news the vault screen should show.
export function tell(message, isError = false) {
  notify(message, isError);
}

// For app.js: whether this device can reach Firebase right now.
export function setConnection(online) {
  const label = $("connection");
  label.textContent = online ? "Online" : "Offline";
  label.classList.toggle("is-offline", !online);
}

function notify(message, isError = false) {
  const notice = $("notice");
  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.classList.toggle("is-error", isError);
  if (message && !isError) noticeTimer = setTimeout(() => (notice.textContent = ""), 3500);
}

async function copy(text, what) {
  const ok = await copyText(text);
  notify(ok ? `Copied ${what}.` : "Couldn't copy. Select the text and copy it yourself.", !ok);
}

// ---- List and search ----

function matches(entry, query) {
  if (!query) return true;
  const haystack = [entry.title, entry.url, entry.username, entry.email, entry.notes].join("\n").toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}

function hostOf(url) {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Set by the browser extension: the site of the open tab, and a way to fill it in.
// { host, fill(entry) -> { user, password } }. Stays null in the web app.
let page = null;

export function setPage(info) {
  page = info;
  if (encKey) renderList(); // the vault may already be open
}

function onThisSite(entry) {
  if (!page || !entry.url) return false;
  const host = hostOf(/^[a-z]+:\/\//i.test(entry.url) ? entry.url : "https://" + entry.url);
  return page.host === host || page.host.endsWith("." + host);
}

// A round letter badge, one soft colour per entry (the same title always gets the same colour).
function avatar(entry) {
  const name = entry.title || entry.url || "?";
  let hash = 0;
  for (const ch of name.toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  const badge = el("span", { class: "avatar", "aria-hidden": "true" }, (name.match(/[\p{L}\p{N}]/u) || ["#"])[0].toUpperCase());
  badge.style.setProperty("--h", String(Math.round((hash % 360) / 30) * 30));
  return badge;
}

function entryRow(entry) {
  const sub = entry.username || entry.email || (entry.url ? hostOf(entry.url) : "");
  return el(
    "li",
    {},
    el(
      "button",
      { type: "button", class: "plain entry", onclick: () => openDetail(entry.id) },
      avatar(entry),
      el("span", { class: "entry-text" }, el("span", { class: "entry-title" }, entry.title || "Untitled"), sub ? el("span", { class: "entry-sub" }, sub) : null)
    )
  );
}

function group(label, items) {
  return el("div", { class: "group" }, el("h3", { class: "group-label" }, label), el("ul", { class: "group-list" }, items.map(entryRow)));
}

function renderList() {
  const query = $("search").value.trim();
  const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
  const shown = entries.filter((entry) => matches(entry, query)).sort(byTitle);

  // Searching shows one plain list. Otherwise entries are grouped, so a long vault reads in small pieces.
  const groups = [];
  if (query) {
    if (shown.length) groups.push(group("Results", shown));
  } else {
    const here = shown.filter(onThisSite);
    if (here.length) groups.push(group("On this site", here));
    const letters = new Map();
    for (const entry of shown) {
      if (here.includes(entry)) continue;
      const first = (entry.title.match(/[\p{L}]/u) || ["#"])[0].toUpperCase();
      const key = first.normalize("NFD")[0].match(/[A-Z]/) ? first.normalize("NFD")[0] : "#";
      if (!letters.has(key)) letters.set(key, []);
      letters.get(key).push(entry);
    }
    const keys = [...letters.keys()].sort((a, b) => (a === "#") - (b === "#") || a.localeCompare(b));
    for (const key of keys) groups.push(group(key, letters.get(key)));
  }
  $("entry-list").replaceChildren(...groups);

  let summary;
  if (!entries.length) summary = unreadable ? "" : "No entries yet. Choose New entry to add your first one.";
  else if (!shown.length) summary = `Nothing matches "${query}".`;
  else if (query) summary = `${shown.length} of ${entries.length} entries`;
  else summary = "";
  if (unreadable) {
    summary += `${summary ? " " : ""}${unreadable} couldn't be opened with this master password.`;
  }
  $("list-summary").textContent = summary;
  $("count").textContent = entries.length === 1 ? "1 entry" : `${entries.length} entries`;
  showBackupStatus();
}

function showBackupStatus() {
  const { text, overdue } = backupStatus(entries.length);
  const line = $("backup-status");
  line.textContent = text;
  line.classList.toggle("is-overdue", overdue);
}

$("search").addEventListener("input", renderList);

$("new-entry").addEventListener("click", () => openEditor(null));

// ---- One entry ----

function openDetail(id) {
  currentId = id;
  renderDetail();
  showPane("detail");
}

function row(label, ...content) {
  return el("div", { class: "row" }, el("dt", {}, label), el("dd", {}, ...content));
}

function copyButton(text, what) {
  return el("button", { type: "button", class: "link", "aria-label": `Copy ${what}`, onclick: () => copy(text, what) }, "Copy");
}

function secretValue(text, what) {
  const value = el("span", { class: "secret" }, MASK);
  let shown = false;
  const toggle = el("button", { type: "button", class: "link", "aria-pressed": "false", "aria-label": `Show ${what}` }, "Show");
  toggle.addEventListener("click", () => {
    shown = !shown;
    value.textContent = shown ? text : MASK;
    toggle.textContent = shown ? "Hide" : "Show";
    toggle.setAttribute("aria-pressed", String(shown));
    toggle.setAttribute("aria-label", `${shown ? "Hide" : "Show"} ${what}`);
  });
  return [value, el("span", { class: "row-actions" }, toggle, copyButton(text, what))];
}

function codeLines(entry) {
  return entry.backupCodes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

// Saves the changed list of codes, then puts focus back on the code you were working on.
async function changeCodes(entry, lines, focusIndex) {
  entry.backupCodes = lines.join("\n");
  await persist(entry);
  renderDetail();
  const buttons = $("pane-detail").querySelectorAll("button.code");
  (buttons[Math.min(focusIndex, buttons.length - 1)] || $("detail-title")).focus();
}

function codesBlock(entry) {
  const lines = codeLines(entry);
  const list = el(
    "ul",
    { class: "codes" },
    lines.map((line, index) => {
      const used = line.startsWith("~");
      const code = used ? line.slice(1).trim() : line;
      return el(
        "li",
        { class: "code-row" },
        el(
          "button",
          {
            type: "button",
            class: "plain code" + (used ? " used" : ""),
            onclick: () => changeCodes(entry, lines.map((l, i) => (i === index ? (used ? code : "~" + code) : l)), index),
          },
          code,
          used ? el("span", { class: "visually-hidden" }, " (used)") : null
        ),
        el(
          "button",
          {
            type: "button",
            class: "link",
            "aria-label": `Remove code ${code}`,
            onclick: () => changeCodes(entry, lines.filter((_, i) => i !== index), index),
          },
          "Remove"
        )
      );
    })
  );
  const unused = lines.filter((line) => !line.startsWith("~"));
  return [
    el("p", { class: "help" }, "Press a code to cross it off once you've used it. Press it again to undo."),
    list,
    unused.length ? el("p", {}, el("button", { type: "button", class: "link", onclick: () => copy(unused.join("\n"), "unused codes") }, "Copy unused codes")) : null,
  ];
}

function renderDetail() {
  const entry = entries.find((e) => e.id === currentId);
  const pane = $("pane-detail");
  if (!entry) {
    currentId = null;
    showPane("list");
    return;
  }

  renderedKey = versionOf(entry);
  const rows = [];
  if (entry.url) {
    const safe = /^https?:\/\//i.test(entry.url);
    rows.push(
      row(
        "Website",
        el("span", { class: "plain-value" }, entry.url),
        el(
          "span",
          { class: "row-actions" },
          safe ? el("a", { href: entry.url, target: "_blank", rel: "noopener noreferrer", "aria-label": "Open website in a new tab" }, "Open") : null,
          copyButton(entry.url, "website")
        )
      )
    );
  }
  if (entry.username) rows.push(row("Username", el("span", { class: "plain-value" }, entry.username), el("span", { class: "row-actions" }, copyButton(entry.username, "username"))));
  if (entry.email) rows.push(row("Email", el("span", { class: "plain-value" }, entry.email), el("span", { class: "row-actions" }, copyButton(entry.email, "email"))));
  if (entry.password) rows.push(row("Password", ...secretValue(entry.password, "password")));
  if (entry.notes) rows.push(row("Notes", el("span", { class: "plain-value notes" }, entry.notes)));
  if (entry.backupCodes.trim()) rows.push(row("Backup codes", ...codesBlock(entry)));
  for (const field of entry.customFields) {
    const label = field.label || "Field";
    if (field.hidden) rows.push(row(label, ...secretValue(field.value || "", label.toLowerCase())));
    else rows.push(row(label, el("span", { class: "plain-value notes" }, field.value || ""), el("span", { class: "row-actions" }, copyButton(field.value || "", label.toLowerCase()))));
  }

  pane.replaceChildren(
    el("button", { type: "button", class: "link back", onclick: () => { currentId = null; showPane("list"); $("search").focus(); } }, "Back to all entries"),
    el(
      "div",
      { class: "detail-head" },
      avatar(entry),
      el("div", {}, el("h3", { id: "detail-title", tabindex: "-1" }, entry.title || "Untitled"), entry.url ? el("p", { class: "detail-sub" }, hostOf(entry.url)) : null)
    ),
    rows.length ? el("dl", { class: "rows" }, rows) : el("p", { class: "muted" }, "This entry has no details yet."),
    el("p", { class: "muted small" }, "Last changed " + new Date(entry.updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })),
    el(
      "div",
      { class: "actions" },
      page ? el("button", { type: "button", onclick: () => autofill(entry) }, "Autofill on this page") : null,
      el("button", { type: "button", class: "secondary", onclick: () => openEditor(entry) }, "Edit"),
      el("button", { type: "button", class: "link danger", onclick: () => removeEntry(entry) }, "Delete")
    )
  );
}

// Fills the login form of the open tab. Asks first if the entry is for a different site.
async function autofill(entry) {
  if (!onThisSite(entry) && !confirm(`This entry is for ${entry.url ? hostOf(entry.url) : "no website"}, but this page is ${page.host}. Fill it in anyway?`)) return;
  try {
    const result = await page.fill(entry);
    if (!result || (!result.user && !result.password)) notify("Couldn't find a login form on this page.", true);
  } catch {
    notify("Couldn't fill in this page. Some pages, such as browser pages, don't allow it.", true);
  }
}

async function removeEntry(entry) {
  if (!confirm(`Delete "${entry.title || "Untitled"}"? This can't be undone.`)) return;
  entries = entries.filter((e) => e.id !== entry.id);
  currentId = null;
  store.removeEntry(entry.id).catch((err) => notify(store.describeError(err), true));
  renderList();
  showPane("list");
  notify("Entry deleted.");
}

// ---- Add or edit ----

function addCustomRow(field = { label: "", value: "", hidden: false }) {
  const row = el(
    "div",
    { class: "custom-row" },
    el("input", { type: "text", "aria-label": "Field name", placeholder: "Name, e.g. PIN", autocomplete: "off", spellcheck: "false", class: "cf-label" }),
    el("input", { type: "text", "aria-label": "Field value", placeholder: "Value", autocomplete: "off", autocapitalize: "none", autocorrect: "off", spellcheck: "false", class: "cf-value" }),
    el(
      "label",
      { class: "check" },
      el("input", { type: "checkbox", class: "cf-hidden" }),
      " Hide value"
    ),
    el("button", { type: "button", class: "link", "aria-label": "Remove this field", onclick: () => row.remove() }, "Remove")
  );
  row.querySelector(".cf-label").value = field.label || "";
  row.querySelector(".cf-value").value = field.value || "";
  row.querySelector(".cf-hidden").checked = !!field.hidden;
  $("custom-rows").append(row);
  return row;
}

function openEditor(entry) {
  editing = entry;
  $("edit-title").textContent = entry ? "Edit entry" : "New entry";
  $("edit-error").textContent = "";
  $("f-title").value = entry?.title || "";
  $("f-url").value = entry?.url || "";
  $("f-username").value = entry?.username || "";
  $("f-email").value = entry?.email || "";
  $("f-password").value = entry?.password || "";
  $("f-notes").value = entry?.notes || "";
  $("f-codes").value = entry?.backupCodes || "";
  $("custom-rows").replaceChildren();
  for (const field of entry?.customFields || []) addCustomRow(field);
  setGenPanel(false);
  // Make sure the password starts hidden.
  $("f-password").type = "password";
  const toggle = document.querySelector('button.reveal[aria-controls="f-password"]');
  if (toggle) {
    toggle.textContent = "Show";
    toggle.setAttribute("aria-pressed", "false");
    toggle.setAttribute("aria-label", "Show password");
  }
  showPane("edit");
}

$("add-field").addEventListener("click", () => addCustomRow().querySelector(".cf-label").focus());

$("edit-cancel").addEventListener("click", () => {
  const back = editing;
  editing = null;
  if (back) openDetail(back.id);
  else showPane("list");
});

$("pane-edit").addEventListener("submit", async (event) => {
  event.preventDefault();
  const title = $("f-title").value.trim();
  if (!title) {
    $("edit-error").textContent = "Give this entry a title.";
    $("f-title").focus();
    return;
  }
  $("edit-error").textContent = "";

  const customFields = [...document.querySelectorAll("#custom-rows .custom-row")]
    .map((row) => ({
      label: row.querySelector(".cf-label").value.trim(),
      value: row.querySelector(".cf-value").value,
      hidden: row.querySelector(".cf-hidden").checked,
    }))
    .filter((field) => field.label || field.value);

  const entry = {
    ...(editing || { id: crypto.randomUUID(), createdAt: Date.now() }),
    title,
    url: $("f-url").value.trim(),
    username: $("f-username").value.trim(),
    email: $("f-email").value.trim(),
    password: $("f-password").value,
    notes: $("f-notes").value,
    backupCodes: $("f-codes").value,
    customFields,
  };

  try {
    await persist(entry);
  } catch {
    $("edit-error").textContent = "Couldn't save this entry. Try again.";
    return;
  }
  editing = null;
  renderList();
  openDetail(entry.id);
  notify("Saved.");
});

// ---- Password generator ----

// In the entry form: a panel under the password field.
let formGenerator = null;

function setGenPanel(open) {
  const panel = $("f-gen");
  const toggle = $("toggle-gen");
  panel.hidden = !open;
  toggle.setAttribute("aria-expanded", String(open));
  toggle.textContent = open ? "Hide the generator" : "Generate a password";
  if (!open) {
    panel.replaceChildren();
    formGenerator = null;
  } else if (formGenerator) formGenerator.regenerate();
  else formGenerator = mountGenerator(panel, { onUse: useGenerated });
}

function useGenerated(password) {
  $("f-password").value = password;
  setGenPanel(false);
  $("f-password").focus();
  notify("Password filled in. Choose Show to check it, then Save.");
}

$("toggle-gen").addEventListener("click", () => setGenPanel($("f-gen").hidden));

// On its own: from the list.
let returnFocus = null;

$("open-generator").addEventListener("click", () => {
  returnFocus = $("open-generator");
  mountGenerator($("generator-root"));
  showPane("generator");
});

// ---- Import ----

function closeImport() {
  $("pane-import").replaceChildren();
  showPane("list");
  $("open-import").focus();
}

$("open-import").addEventListener("click", () => {
  mountImport($("pane-import"), { close: closeImport, entries: () => entries, saveMany, notify }).start();
  showPane("import");
  $("import-title").focus();
});

// ---- Backup, restore, settings ----

$("download-backup").addEventListener("click", async () => {
  if (!entries.length) {
    notify("There's nothing to back up yet.", true);
    return;
  }
  const button = $("download-backup");
  button.disabled = true;
  if (await downloadBackup({ entries: () => entries, key: () => encKey, email: () => $("who").textContent, config: store.loadConfig, notify })) showBackupStatus();
  button.disabled = false;
});

function closeRestore() {
  $("pane-restore").replaceChildren();
  showPane("list");
  $("open-restore").focus();
}

$("open-restore").addEventListener("click", () => {
  mountRestore($("pane-restore"), { close: closeRestore, key: () => encKey, entries: () => entries, saveMany, notify }).start();
  showPane("restore");
  $("restore-title").focus();
});

$("open-settings").addEventListener("click", () => {
  returnFocus = $("open-settings");
  $("s-days").value = getReminderDays();
  $("settings-error").textContent = "";
  showPane("settings");
});

$("settings-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const days = Number($("s-days").value);
  if (!Number.isInteger(days) || days < 1 || days > 365) {
    $("settings-error").textContent = "Enter a whole number of days from 1 to 365.";
    $("s-days").focus();
    return;
  }
  setReminderDays(days);
  showBackupStatus();
  showPane("list");
  $("open-settings").focus();
  notify("Saved.");
});

document.querySelectorAll("[data-back]").forEach((button) =>
  button.addEventListener("click", () => {
    $("generator-root").replaceChildren();
    showPane("list");
    (returnFocus || $("search")).focus();
    returnFocus = null;
  })
);
