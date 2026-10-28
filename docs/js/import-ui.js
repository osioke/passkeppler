// The Import screen: choose a file, match columns, review rows, import.

import { el } from "./ui.js";
import { readFile, guessRoles, buildEntries, duplicateKey, ROLES } from "./importer.js";

const HIDDEN_ROLES = ["password", "extraHidden", "codes"];

export function mountImport(root, ctx) {
  let headers = [];
  let rows = [];
  let roles = [];
  let items = []; // { entry, include, duplicate, order }
  let sortBy = "file";

  const back = (label = "Back to all entries", action = ctx.close) =>
    el("button", { type: "button", class: "link", onclick: action }, label);

  function finishRender(...children) {
    root.replaceChildren(...children);
    const heading = root.querySelector("h3");
    if (heading) heading.focus();
  }

  // ---- 1. Choose a file ----
  function chooseStage(message = "") {
    const error = el("p", { class: "error", id: "import-error", role: "alert" }, message);
    const input = el("input", { type: "file", id: "import-file", accept: ".csv,.tsv,.txt,.xlsx,text/csv", "aria-describedby": "import-error" });
    input.addEventListener("change", async () => {
      const file = input.files[0];
      if (!file) return;
      error.textContent = "";
      try {
        const all = await readFile(file);
        if (all.length < 2) throw new Error("That file has no rows to import. The first row should be the column names, with your entries below.");
        headers = all[0].map((h) => h.trim());
        rows = all.slice(1);
        roles = guessRoles(headers);
        columnsStage();
      } catch (err) {
        error.textContent = err.message || "Couldn't read that file.";
      }
    });
    finishRender(
      back(),
      el("h3", { id: "import-title", tabindex: "-1" }, "Import entries"),
      el("p", {}, "Choose a CSV or XLSX file, such as an export from 1Password. Nothing is saved until you've reviewed it and pressed Import."),
      el("label", { for: "import-file" }, "File"),
      input,
      error,
      el("p", { class: "help" }, "Delete the file from your computer once you've imported it. It holds your passwords as plain text.")
    );
  }

  // ---- 2. Match columns ----
  function columnsStage() {
    const selects = headers.map((header, i) => {
      const select = el(
        "select",
        { id: `map-${i}`, "aria-label": `What to do with the column "${header || "Column " + (i + 1)}"` },
        ROLES.map(([value, label]) => el("option", { value, selected: roles[i] === value }, label))
      );
      select.addEventListener("change", () => (roles[i] = select.value));
      return select;
    });

    const mapRows = headers.map((header, i) => {
      const sample = rows.map((r) => r[i]).find((v) => v && v.trim()) || "";
      const hidden = HIDDEN_ROLES.includes(roles[i]) || /otp|secret|key|pin|token/i.test(header);
      return el(
        "li",
        { class: "map-row" },
        el("label", { for: `map-${i}` }, el("strong", {}, header || `Column ${i + 1}`), sample ? el("span", { class: "entry-sub" }, hidden ? "Hidden" : sample.length > 40 ? sample.slice(0, 40) + "…" : sample) : null),
        selects[i]
      );
    });

    finishRender(
      back("Choose a different file", () => chooseStage()),
      el("h3", { id: "import-title", tabindex: "-1" }, "Match the columns"),
      el("p", {}, `Found ${rows.length} ${rows.length === 1 ? "row" : "rows"} and ${headers.length} columns. Check what each column should become.`),
      el("ul", { class: "map-list" }, mapRows),
      el("div", { class: "actions" }, el("button", { type: "button", onclick: reviewStage }, "Review rows"))
    );
  }

  // ---- 3. Review rows ----
  function reviewStage() {
    const existing = new Set(ctx.entries().map((entry) => duplicateKey(entry)));
    items = buildEntries(rows, headers, roles).map((entry, order) => {
      const duplicate = existing.has(duplicateKey(entry));
      return { entry, include: !duplicate, duplicate, order };
    });
    drawReview();
  }

  function drawReview() {
    if (!items.length) {
      finishRender(
        back("Back to columns", columnsStage),
        el("h3", { id: "import-title", tabindex: "-1" }, "Nothing to import"),
        el("p", {}, "No rows had anything in the columns you chose. Go back and check the column choices.")
      );
      return;
    }

    const sorted = [...items].sort((a, b) =>
      sortBy === "title" ? a.entry.title.localeCompare(b.entry.title, undefined, { sensitivity: "base" }) : a.order - b.order
    );

    const importButton = el("button", { type: "button" });
    const summary = el("p", { class: "muted", role: "status" });
    const refresh = () => {
      const count = items.filter((i) => i.include).length;
      importButton.textContent = count === 1 ? "Import 1 entry" : `Import ${count} entries`;
      importButton.disabled = count === 0;
      const dupes = items.filter((i) => i.duplicate).length;
      summary.textContent = `${items.length} ${items.length === 1 ? "row" : "rows"}, ${count} selected.` + (dupes ? ` ${dupes} already in your vault ${dupes === 1 ? "is" : "are"} unchecked.` : "");
    };

    const list = el(
      "ul",
      { class: "import-list" },
      sorted.map((item) => {
        const n = item.order;
        const include = el("input", { type: "checkbox", id: `imp-${n}-on`, checked: item.include });
        include.addEventListener("change", () => {
          item.include = include.checked;
          refresh();
        });
        const field = (key, label, type = "text") => {
          const input = el("input", { type, id: `imp-${n}-${key}`, autocomplete: "off", autocapitalize: "none", autocorrect: "off", spellcheck: "false" });
          input.value = item.entry[key];
          input.addEventListener("input", () => (item.entry[key] = input.value));
          return el("div", {}, el("label", { for: `imp-${n}-${key}` }, label), input);
        };
        return el(
          "li",
          { class: "import-row" },
          el("div", { class: "import-head" }, el("label", { class: "check", for: `imp-${n}-on` }, include, el("span", {}, item.duplicate ? "Already in your vault" : "Import this row"))),
          el("div", { class: "import-grid" }, field("title", "Title"), field("url", "Website"), field("username", "Username"), field("email", "Email", "text"))
        );
      })
    );

    const sortSelect = el("select", { id: "import-sort", "aria-label": "Sort rows" }, [["file", "File order"], ["title", "Title, A to Z"]].map(([v, l]) => el("option", { value: v, selected: sortBy === v }, l)));
    sortSelect.addEventListener("change", () => {
      sortBy = sortSelect.value;
      drawReview();
    });

    const setAll = (on) => () => {
      for (const item of items) item.include = on;
      drawReview();
    };

    importButton.addEventListener("click", async () => {
      const chosen = items.filter((i) => i.include).map((i) => i.entry);
      importButton.disabled = true;
      importButton.textContent = "Importing…";
      try {
        const saved = await ctx.saveMany(chosen, (done, total) => (importButton.textContent = `Importing ${done} of ${total}…`));
        ctx.notify(`Imported ${saved} ${saved === 1 ? "entry" : "entries"}. They're now in your vault.`);
        items = rows = [];
        ctx.close();
      } catch {
        importButton.disabled = false;
        refresh();
        ctx.notify("Couldn't import. Try again.", true);
      }
    });

    finishRender(
      back("Back to columns", columnsStage),
      el("h3", { id: "import-title", tabindex: "-1" }, "Review before importing"),
      summary,
      el(
        "div",
        { class: "import-tools" },
        el("button", { type: "button", class: "link", onclick: setAll(true) }, "Select all"),
        el("button", { type: "button", class: "link", onclick: setAll(false) }, "Select none"),
        el("label", { for: "import-sort", class: "visually-hidden" }, "Sort rows"),
        sortSelect
      ),
      list,
      el("div", { class: "actions" }, importButton)
    );
    refresh();
  }

  return { start: () => chooseStage() };
}
