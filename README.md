# passkeppler

> A broke man's alternative to password keeping.

passkeppler is a simple, personal password keeper. It lets you store your logins, keep track of backup (recovery) codes, generate strong passwords, and reach everything from a browser extension or a web page. You run it on your own free Firebase account, so there is no subscription and nobody else holds your data.

It is built for one person. It is deliberately small, with no teams, sharing or extras.

> **Status: first version complete.** The web app and the browser extension both work. It is a personal project, so expect rough edges, and see the note at the end about security.

---

## What it does

- **Keeps your logins**: title, website, username and/or email, password, notes, and any extra fields you want (a PIN, a recovery key, and so on).
- **Tracks backup codes**: paste a block of codes for an account, then tap each one to cross it off once it's used.
- **Generates strong passwords**: random characters, or word phrases you can actually remember.
- **Imports from 1Password**: bring in a CSV or XLSX export, check it on a preview screen, fix or remove bad rows, then save.
- **Syncs everywhere you use it**: the browser extension and the web page share the same vault.
- **Keeps working when things fail**: every device holds its own copy, and one click downloads a backup file you can open in any browser, with no internet and no app.

## What it doesn't do

It isn't a full replacement for a commercial password manager. It has no team sharing, no phone app, and it doesn't store authenticator (OTP) codes. The goal is the basics, done simply.

---

## How it works, in plain words

You choose **one master password**. It's the only password you have to remember.

**Your account password is your master password.** Many password managers make you sign up with one password and then set up a separate master password. passkeppler keeps this simple: when you create your account, the password you enter *is* your master password. There is no second one.

It still does two separate jobs behind the scenes. Your password is turned into two different values. One is used to sign in to Firebase, and the other is used to scramble your vault. The second value never leaves your device, so Firebase can sign you in without ever being able to read your data.

Before anything is saved, your vault is scrambled on your own device using that password. What reaches the database is unreadable, so even someone looking straight at it can't see your passwords. Only your master password can unscramble it.

The data is stored in **your own Firebase project** (a free Google service), not on a server run by someone else. The code in this repository contains no one's database details. You paste in your own.

> **If you forget your master password, it cannot be recovered.** Nobody can reset it, including whoever built this. Write it on paper and keep it somewhere safe.

---

## Setting it up for yourself

You need a free Google account and about 20 minutes. You don't need to write any code.

### 1. Get your own copy

Click **Fork** at the top of this page to copy the project into your own GitHub account.

### 2. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and click **Add project**. Give it any name, and you can turn off Google Analytics.
2. **Authentication**: open **Build → Authentication → Get started → Email/Password** and enable it.
3. **Database**: open **Build → Firestore Database → Create database**. Pick **production mode** and a region near you.
4. **Rules**: in Firestore, open the **Rules** tab, replace the contents with the text in this repo's [`firestore.rules`](firestore.rules) file, and click **Publish**. This makes sure each account can only reach its own data.
5. **Get your config**: open **Project settings** (the gear icon) → **Your apps** → click the web icon `</>`, give the app any name, and register it. Firebase then shows a block that begins `const firebaseConfig = {`. Copy it. You'll paste it into the app in step 4.
6. **Allow your web page**: open **Authentication → Settings → Authorised domains → Add domain**, and add `<your-github-username>.github.io`.

The config is not a secret. It's an address, not a key, and it's normal for it to be visible. Your data is protected by your master password and the database rules.

### 3. Turn on the web page

In your forked repository, open **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch**, then branch `main` and folder `/docs`, and click **Save**. After a minute or two your page is live at `https://<your-github-username>.github.io/passkeppler/`.

### 4. First run

1. Open your web page.
2. Paste the Firebase config you copied.
3. Enter your email and choose a password, then create your account. This is your **master password**, not a separate account password. You'll type it every time you unlock the vault, and it can't be recovered if you forget it. Use at least 12 characters; a few random words joined together works well.
4. Recommended: once your account exists, turn off new sign-ups so nobody else can register on your project. In Firebase, open **Authentication → Settings → User actions** and turn off **Enable create (sign-up)**. Only your existing account can then sign in.
5. Recommended: so you never have to find your config again, open `docs/firebase-config.js`, replace `null` with your config (the part between the curly brackets, brackets included, as the comments in the file show), and publish it. After that, any device that opens your page only needs your email and master password. The config is an address, not a key, so it's safe for it to be public.

### 5. Install the browser extension

The extension isn't published in a store, so you build it once and load it yourself. It works in Chrome, Edge, Brave and other Chromium browsers. You need [Node.js](https://nodejs.org) for the build.

1. Download or clone your copy of this repository.
2. In a terminal, go into the `extension` folder and run `npm install`, then `node build.mjs`. This makes an `extension/dist` folder. (The build bundles Firebase into the extension, because browsers don't let extensions load code from the internet.)
3. In your browser, open the extensions page (`chrome://extensions` in Chrome, `edge://extensions` in Edge, `brave://extensions` in Brave) and turn on **Developer mode**. Other browsers have their own address and menu names, so if you use a different one, search online for "[your browser] extensions page".
4. Click **Load unpacked** and choose the `extension/dist` folder.
5. Open the extension and sign in with the same email and master password. (If you put your config in `docs/firebase-config.js` above, it connects on its own. Otherwise, paste the same config first.)

Once unlocked, the extension stays unlocked until you press **Lock** or close the browser. It opens at once from the copy of your vault on that device, and signs in to Firebase in the background. To fill in a login, open the site, open the extension, choose the entry and press **Autofill on this page**. Entries for the site you're on are listed first. Choosing a file closes a popup, so **Import** and **Restore** are in a full tab: press **Open in tab**. After you change the web app's code, run `node build.mjs` again and press the refresh arrow on the extensions page.

**Saving logins as you go.** When you sign in on a page with a normal login form (a username and a password on the same page), a small card appears on the page itself: **Save this login?**, or **Update the saved password?** if you already have that site saved under the same name with a different password. If the login is already saved exactly like that, nothing appears. Nothing is saved until you press the button, and **Not now** drops it. The card waits until the login seems to have worked (no password box left on the page), so a wrong password that brings the login form back isn't offered.

While you're unlocked, the extension keeps your vault open in a hidden page of its own, so it can check what's saved without you opening anything. That page is closed when you press **Lock**. If you're locked, the card says **Unlock to save this login** with an **Unlock** button, because only an unlocked vault can be checked; your master password is only ever typed in the extension's own window, never on the page. Once you unlock, the same card turns into Save or Update. If the card can't appear at all, a green **!** shows on the icon and the offer is waiting at the top of the popup. What it noticed is kept in the browser's memory only, and is thrown away when you press **Lock**, close the tab or close the browser.

To do this the extension has to run on every website, so your browser will say it can "read and change your data on all sites". It only looks at a form at the moment you submit it, and only passes what it sees to the extension itself. The extension adds its watcher to pages that are already open when you install or refresh it, so they don't need reloading. The popup also says whether the page you're on is being watched, and if a login form was skipped, why.

**Sign-ups** work the same way. When you create an account (an email, maybe a username, and a new password, usually typed twice), the card says **You signed up at…** and offers to save it. If you already have that login saved it says **Already saved**, and if the site already has other saved logins under another name it mentions them. First name, phone and other sign-up boxes are ignored; only the email and username are kept.

**Two-step logins** (username or email on one step, password on the next, on separate pages or on the same page) are joined up: the extension remembers the name from the first step, and when the password step follows on the same site it offers to save the two together. The name is kept in the browser's memory only, for up to 10 minutes, and is thrown away on **Lock** or when the tab closes. If a password step comes with no earlier step seen on that tab, it is skipped, and the popup says why.

**Updating keeps history.** When you press **Update**, the old password is kept on that entry as a hidden extra field called "Previous password, <date>" (show it with the eye button), so a mistaken update never loses anything.

**Never for this site.** Every offer has a **Never for this site** button. The site is then not watched at all. The list is in the popup under **Settings** ("Sites passkeppler won't offer to save"), where **Remove** brings a site back. The list is kept on that device only, in the extension's own storage, as plain site names (no passwords), and is not synced.

**Pages with no form.** Many sites don't use a real form: their own script sends the login in the background and changes the page without reloading. These are now noticed too, when you press a button (or Enter) next to a filled password box. Buttons that look like "Show password" or "Forgot password" don't count. As before, the card only appears once the password box is gone, so a wrong password isn't offered.

**"Sign in with Google" and similar.** With these there is no password to save, so passkeppler offers to save a note instead: **Note that this site uses Google?** Pressing **Save note** adds an entry for the site with no password and the note "Signs in with Google." in its notes. It is recognised by the button's short text or label ("Sign in with…", "Log in with…", "Continue with…" and Google, Facebook, Apple, GitHub, Microsoft, Twitter, LinkedIn, Amazon, Discord, Yahoo), or by a link going to that service's sign-in page. The card waits until you are back on the site and its sign-in button is gone, so backing out of the Google window offers nothing, and it never shows on the other service's own pages. If the site already has that note, nothing appears. Which Google account you chose is not known to passkeppler, so it isn't recorded.

**Logins inside frames, and unusual login boxes.** A login box embedded in a page from another address (common with embedded sign-in widgets) is now watched too, and the login is saved under the page you are on, not the frame's address. Because the page can't see into the frame, passkeppler looks into it itself and offers only once the frame's password box (or sign-in button) is gone; if the frame shows the login again (a wrong password) nothing is offered. Google's own embedded "Sign in with Google" button is covered this way too. Login boxes built as page components with an open "shadow root" are also found. **Because the extension now also runs inside frames, refresh it on the extensions page and reload your open tabs after updating.**

Still missed, on purpose or by limit: boxes in closed shadow roots (nothing can reach them), logins that open in a separate pop-up window (the offer is lost when that window closes), logins that are not typed in at all (passkeys, magic links, codes sent to you), and fields that aren't ordinary inputs (drawn on a canvas, or editable text areas). The popup's "Watching this page" line says whether a page is being watched and, if a form was skipped, why, so when a site misses, tell me the address and what the popup says.

For now this covers normal, sign-up, two-step, no-form, frame and "sign in with" logins. Forms for changing a password are not noticed yet.

### 6. Bring in your old passwords (optional)

Export from 1Password as CSV or XLSX, then choose **Import** in the app. Check the columns it matched, review the preview, and confirm. **Delete the original export file afterwards.** It contains your passwords as plain text.

---

## Backups

You are your own safety net, so make backups.

- Use **Backup** to save a single `.html` file. It contains your whole vault, scrambled with your master password, plus a small viewer.
- Double-click it to open in any browser, with no internet, no Firebase and no app needed. Type your master password and read your entries.
- Keep copies in more than one place, such as your computer, an external drive, and one or two online drives.
- The app reminds you when your last backup is more than 14 days old.

---

## About word phrases

The generator's word phrases pick words at random from a list of 7,772 words, so each word adds about 12.9 bits of strength and a 7-word phrase has about 90 bits. The strength meter in the generator is based on these numbers. The list is public on purpose: a phrase is safe because of how many combinations are possible, not because the list is secret.

The word list is the [EFF large wordlist](https://www.eff.org/dice) by the Electronic Frontier Foundation, used under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Four words containing a hyphen were removed.

---

## For developers

- **Plain HTML, CSS and JavaScript.** No framework and no build step for the web app.
- **Layout:** `docs/` is the web app (served by GitHub Pages). `extension/` is the browser extension (Manifest V3). It reuses the web app's files from `docs/`, and `node build.mjs` assembles it into `extension/dist`. `firestore.rules` holds the database rules.
- **Backend:** Firebase Auth (email and password) and Firestore. The app talks to the database through a small separate layer, so another database could be added.
- **Keys:** your master password goes through PBKDF2 to produce a master key, and HKDF splits that into two independent values. One is used as the Firebase password. The other is the encryption key and never leaves the device.
- **Encryption:** each entry is encrypted as a single AES-256-GCM blob using the browser's Web Crypto API. Firestore stores only the ciphertext and a few plain fields (id, schema version, last-updated time).
- **Sync:** last write wins, per entry.
- **Offline:** each client keeps an encrypted local copy of the vault.

This is a personal project. It hasn't had an independent security review, so use it at your own risk and keep backups.

## Working on it with an AI assistant

[`PROMPT.md`](PROMPT.md) has a ready-made prompt you can paste into a new chat to start changing passkeppler. It tells the assistant to read these documents first and to keep changes small and simple.

## Design

The full description of what passkeppler is and how it behaves is in [`DESIGN.md`](DESIGN.md).
