// Decides what to offer for a login the page showed us. Plain functions with no browser needed.
//
//   login:   { host, origin, username, password }
//   entries: the decrypted vault
//   returns: { kind: "save" }                  nothing like it is saved yet
//            { kind: "update", entry }         saved for this site and name, but the password is different
//            { kind: "same", entry }           already saved exactly like this

function hostOf(url) {
  try {
    return new URL(/^[a-z]+:\/\//i.test(url) ? url : "https://" + url).host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

// The same rule the list uses for "On this site": the entry's site, or a page inside it.
function onSite(entry, host) {
  const entryHost = entry.url ? hostOf(entry.url) : "";
  return !!entryHost && (host === entryHost || host.endsWith("." + entryHost));
}

export function decide(login, entries) {
  const name = login.username.trim().toLowerCase();
  const mine = entries
    .filter((entry) => onSite(entry, login.host))
    .filter((entry) => [entry.username, entry.email].some((value) => value && value.trim().toLowerCase() === name))
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const same = mine.find((entry) => entry.password === login.password);
  if (same) return { kind: "same", entry: same };
  if (mine.length) return { kind: "update", entry: mine[0] };
  return { kind: "save" };
}

// What a new entry would hold. A name with an @ in it goes in Email, anything else in Username.
export function newEntryFrom(login) {
  const isEmail = login.username.includes("@");
  return {
    title: login.host,
    url: login.origin,
    username: isEmail ? "" : login.username,
    email: isEmail ? login.username : "",
    password: login.password,
  };
}
