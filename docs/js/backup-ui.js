// Download a backup, and the Restore screen.

import { el } from "./ui.js";
import { buildBackup, backupFileName, readBackupHeader, openBackup, planRestore, latestChange } from "./backup.js";
import { markBackupDone } from "./prefs.js";

const when = (time) => (time ? new Date(time).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "unknown");

export async function downloadBackup(ctx) {
  try {
    const text = await buildBackup({ entries: ctx.entries(), encKey: ctx.key(), email: ctx.email(), config: ctx.config() });
    const url = URL.createObjectURL(new Blob([text], { type: "text/html" }));
    const link = el("a", { href: url, download: backupFileName() });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    markBackupDone();
    ctx.notify("Backup downloaded. Keep a copy somewhere other than this computer too.");
    return true;
  } catch {
    ctx.notify("Couldn't make the backup. Try again.", true);
    return false;
  }
}

export function mountRestore(root, ctx) {
  function finishRender(...children) {
    root.replaceChildren(...children);
    const heading = root.querySelector("h3");
    if (heading) heading.focus();
  }

  function chooseStage(message = "") {
    const error = el("p", { class: "error", id: "restore-error", role: "alert" }, message);
    const input = el("input", { type: "file", id: "restore-file", accept: ".html,text/html", "aria-describedby": "restore-error" });
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      error.textContent = "";
      try {
        const payload = readBackupHeader(await file.text());
        let fromBackup;
        try {
          fromBackup = await openBackup(payload, ctx.key());
        } catch {
          throw new Error(`This backup can't be opened with the master password you're using now. It was made for ${payload.email}. Open the file in a browser to read it, or sign in with that account to restore it.`);
        }
        confirmStage(payload, fromBackup);
      } catch (err) {
        error.textContent = err.message || "Couldn't read that file.";
      }
    });
    finishRender(
      el("button", { type: "button", class: "link", onclick: ctx.close }, "Back to all entries"),
      el("h3", { id: "restore-title", tabindex: "-1" }, "Restore from a backup"),
      el("p", {}, "Choose a passkeppler backup file. Restoring adds entries that are missing and brings in the backup's copy of an entry only when it's newer than yours. It never deletes anything."),
      el("label", { for: "restore-file" }, "Backup file"),
      input,
      error
    );
  }

  function confirmStage(payload, fromBackup) {
    const current = ctx.entries();
    const plan = planRestore(current, fromBackup);
    const total = plan.add.length + plan.update.length;
    const older = payload.latestChange < latestChange(current);

    const button = el("button", { type: "button", disabled: total === 0 }, total === 1 ? "Restore 1 entry" : `Restore ${total} entries`);
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Restoring…";
      try {
        await ctx.saveMany([...plan.add, ...plan.update], (done, count) => (button.textContent = `Restoring ${done} of ${count}…`), { keepTime: true });
        ctx.notify(`Restored ${total} ${total === 1 ? "entry" : "entries"}.`);
        ctx.close();
      } catch {
        button.disabled = false;
        ctx.notify("Couldn't restore. Try again.", true);
      }
    });

    const line = (label, value) => el("div", { class: "row" }, el("dt", {}, label), el("dd", {}, el("span", { class: "plain-value" }, value)));
    finishRender(
      el("button", { type: "button", class: "link", onclick: () => chooseStage() }, "Choose a different file"),
      el("h3", { id: "restore-title", tabindex: "-1" }, "Ready to restore"),
      el("dl", { class: "rows" }, line("Backup made", when(payload.createdAt)), line("Entries in backup", String(fromBackup.length)), line("Latest change in backup", when(payload.latestChange)), line("Latest change in your vault", when(latestChange(current)))),
      ...(older ? [el("p", { class: "warning" }, "This backup is older than your vault. Anything newer in your vault is kept.")] : []),
      el(
        "p",
        {},
        total === 0
          ? "Your vault already has everything in this backup."
          : `${plan.add.length} missing ${plan.add.length === 1 ? "entry" : "entries"} will be added, and ${plan.update.length} will be updated to the backup's newer copy. ${plan.same} ${plan.same === 1 ? "is" : "are"} already up to date.`
      ),
      el("div", { class: "actions" }, button)
    );
  }

  return { start: () => chooseStage() };
}
