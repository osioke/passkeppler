// Reads CSV and XLSX files (like a 1Password export) and turns rows into entries.
// No libraries: the XLSX reader uses the browser's built-in unzip.

// ---- CSV ----

// Handles quoted fields, commas and line breaks inside quotes, and "" for a quote.
export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === "") {
      quoted = true;
    } else if (c === delimiter) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return trimRows(rows);
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/, 1)[0] || "";
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const c of firstLine) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && c in counts) counts[c]++;
  }
  const [best, count] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return count ? best : ",";
}

// Drops rows that are completely empty, and empty columns at the right.
function trimRows(rows) {
  const kept = rows.filter((row) => row.some((cell) => String(cell).trim() !== ""));
  const width = kept.reduce((max, row) => {
    let last = row.length;
    while (last > 0 && String(row[last - 1]).trim() === "") last--;
    return Math.max(max, last);
  }, 0);
  return kept.map((row) => Array.from({ length: width }, (_, i) => (row[i] ?? "").toString()));
}

// ---- XLSX ----
// An .xlsx file is a zip of XML files. We read the zip index, unpack what we need,
// then read the first sheet.

const decoder = new TextDecoder();

async function unzip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Find the "end of central directory" record at the end of the file.
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("This doesn't look like an XLSX file.");

  const count = view.getUint16(end + 10, true);
  let pos = view.getUint32(end + 16, true);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(pos, true) !== 0x02014b50) throw new Error("This XLSX file is damaged.");
    const method = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const nameLength = view.getUint16(pos + 28, true);
    const extraLength = view.getUint16(pos + 30, true);
    const commentLength = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = decoder.decode(bytes.subarray(pos + 46, pos + 46 + nameLength));
    files.set(name, { method, compressedSize, localOffset });
    pos += 46 + nameLength + extraLength + commentLength;
  }

  return async (name) => {
    const info = files.get(name);
    if (!info) return null;
    const local = info.localOffset;
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.subarray(start, start + info.compressedSize);
    if (info.method === 0) return decoder.decode(data);
    if (info.method !== 8) throw new Error("This XLSX file uses a compression type that isn't supported.");
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return decoder.decode(await new Response(stream).arrayBuffer());
  };
}

function xml(text) {
  return new DOMParser().parseFromString(text, "application/xml");
}

function columnIndex(ref) {
  let n = 0;
  for (const c of ref.replace(/[0-9]/g, "")) n = n * 26 + (c.charCodeAt(0) - 64);
  return n - 1;
}

function textOf(node) {
  // Joins every <t> piece, so formatted text with several runs still reads correctly.
  return [...node.getElementsByTagName("t")].map((t) => t.textContent).join("");
}

export async function parseXLSX(buffer) {
  const read = await unzip(buffer);

  const sharedXml = await read("xl/sharedStrings.xml");
  const shared = sharedXml ? [...xml(sharedXml).getElementsByTagName("si")].map(textOf) : [];

  // The first sheet in the workbook (usually sheet1.xml).
  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbook = await read("xl/workbook.xml");
  const rels = await read("xl/_rels/workbook.xml.rels");
  if (workbook && rels) {
    const first = xml(workbook).getElementsByTagName("sheet")[0];
    const rid = first && (first.getAttribute("r:id") || first.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id"));
    const target = rid && [...xml(rels).getElementsByTagName("Relationship")].find((r) => r.getAttribute("Id") === rid)?.getAttribute("Target");
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
  }
  const sheetXml = await read(sheetPath);
  if (!sheetXml) throw new Error("Couldn't find a sheet in this XLSX file.");

  const rows = [];
  for (const rowNode of xml(sheetXml).getElementsByTagName("row")) {
    const row = [];
    for (const cell of rowNode.getElementsByTagName("c")) {
      const ref = cell.getAttribute("r");
      const type = cell.getAttribute("t");
      let value = "";
      if (type === "inlineStr") value = textOf(cell);
      else {
        const v = cell.getElementsByTagName("v")[0];
        if (v) value = type === "s" ? shared[Number(v.textContent)] ?? "" : v.textContent;
      }
      const index = ref ? columnIndex(ref) : row.length;
      while (row.length < index) row.push("");
      row[index] = value;
    }
    rows.push(row);
  }
  return trimRows(rows);
}

export async function readFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx")) return parseXLSX(await file.arrayBuffer());
  if (name.endsWith(".csv") || name.endsWith(".tsv") || name.endsWith(".txt") || file.type.includes("csv")) return parseCSV(await file.text());
  throw new Error("Choose a .csv or .xlsx file.");
}

// ---- Matching columns ----

export const ROLES = [
  ["title", "Title"],
  ["url", "Website"],
  ["username", "Username"],
  ["email", "Email"],
  ["password", "Password"],
  ["notes", "Notes"],
  ["codes", "Backup codes"],
  ["extra", "Extra field"],
  ["extraHidden", "Extra field (hidden)"],
  ["skip", "Skip this column"],
];

// Guesses what each column is from its header.
export function guessRoles(headers) {
  return headers.map((header) => {
    const h = header.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (!h) return "skip";
    if (/^(otp|totp|one time|2fa|authenticator)/.test(h) || /otpauth/.test(h)) return "skip";
    if (/^(type|category|folder|vault|tags?|favou?rite|archived|created|modified|updated|last)/.test(h)) return "skip";
    if (/^(title|name|entity|item|account|app|service|site name|label)$/.test(h)) return "title";
    if (/(backup|recovery|reset|rescue|emergency) codes?$|^codes?$/.test(h)) return "codes";
    if (/^(url|urls|website|web site|site|link|address|web address|login url|domain)$/.test(h)) return "url";
    if (/^(username|user name|user|login|login name|user id|userid|handle)$/.test(h)) return "username";
    if (/^(e mail|email|email address|mail)$/.test(h)) return "email";
    if (/^(password|pass|pwd|passcode|secret)$/.test(h)) return "password";
    if (/^(notes?|comments?|remarks?|description|details)$/.test(h)) return "notes";
    if (/(key|pin|secret|code|answer|token)/.test(h)) return "extraHidden";
    return "extra";
  });
}

// ---- Rows to entries ----

export function hostOf(url) {
  try {
    return new URL(/^[a-z]+:\/\//i.test(url) ? url : "https://" + url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// rows excludes the header row. roles has one entry per column.
export function buildEntries(rows, headers, roles) {
  const entries = [];
  for (const row of rows) {
    const entry = { title: "", url: "", username: "", email: "", password: "", notes: "", backupCodes: "", customFields: [] };
    const codes = [];
    roles.forEach((role, i) => {
      const value = (row[i] ?? "").toString().trim();
      if (!value || role === "skip") return;
      if (role === "title" || role === "url" || role === "username" || role === "email" || role === "password") {
        entry[role] = entry[role] ? entry[role] : value;
      } else if (role === "notes") entry.notes = entry.notes ? entry.notes + "\n" + value : value;
      else if (role === "codes") codes.push(value);
      else entry.customFields.push({ label: headers[i] || "Field", value: (row[i] ?? "").toString(), hidden: role === "extraHidden" });
    });
    if (codes.length) entry.backupCodes = codes.join("\n");
    if (!entry.title) entry.title = entry.url ? hostOf(entry.url) : entry.username || entry.email || "";
    const hasContent = entry.title || entry.url || entry.username || entry.email || entry.password || entry.notes || entry.backupCodes || entry.customFields.length;
    if (!hasContent) continue;
    entry.title = entry.title || "Untitled";
    entries.push(entry);
  }
  return entries;
}

// Same site and account as something already saved?
export function duplicateKey(entry) {
  return [entry.title.trim().toLowerCase(), (entry.username || entry.email || "").trim().toLowerCase(), hostOf(entry.url || "")].join("|");
}
