// Decides what to offer for a login the page showed us. Plain functions with no browser needed.
//
//   login:   { host, origin, username, email?, password }
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
  // The name typed, and the email too if the form had both (a sign-up often does).
  const names = [login.username, login.email].filter(Boolean).map((name) => name.trim().toLowerCase());
  const here = entries.filter((entry) => onSite(entry, login.host));
  const mine = here
    .filter((entry) => [entry.username, entry.email].some((value) => value && names.includes(value.trim().toLowerCase())))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const others = here.length - mine.length; // saved logins for this site under another name

  const same = mine.find((entry) => entry.password === login.password);
  if (same) return { kind: "same", entry: same, others };
  if (mine.length) return { kind: "update", entry: mine[0], others };
  return { kind: "save", others };
}

// What a new entry would hold. A name with an @ in it goes in Email, anything else in Username.
export function newEntryFrom(login) {
  const names = [...new Set([login.username, login.email].filter(Boolean))];
  return {
    title: login.host,
    url: login.origin,
    username: names.find((name) => !name.includes("@")) || "",
    email: names.find((name) => name.includes("@")) || "",
    password: login.password,
  };
}

// A short note for the offer, when the site already has other saved logins.
export function othersNote(others) {
  return others ? ` You have ${others} other saved login${others === 1 ? "" : "s"} for this site.` : "";
}
