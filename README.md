# passkeppler

> A broke man's alternative to password keeping.

passkeppler is a simple, personal password keeper. It lets you store your logins, keep track of backup (recovery) codes, generate strong passwords, and reach everything from a browser extension or a web page. You run it on your own free Firebase account, so there is no subscription and nobody else holds your data.

It is built for one person. It is deliberately small, with no teams, sharing or extras.

> **Status: in development.** The instructions below describe how it is meant to be set up and used. They will be tightened as each part is finished.

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
4. Optional: in Firebase, once your account exists, you can disable new sign-ups so nobody else can register on your project.

### 5. Install the browser extension

*(Coming with the first release.)* The extension isn't published in a store. You load it from the `extension` folder:

1. Download or clone your copy of this repository.
2. In your browser, open the extensions page (`chrome://extensions` in Chrome, `edge://extensions` in Edge) and turn on **Developer mode**. Other browsers have their own address and menu names, so if you use a different one, search online for "[your browser] extensions page".
3. Click **Load unpacked** and choose the `extension` folder.
4. Open the extension, paste the same Firebase config, and sign in with the same email and master password.

### 6. Bring in your old passwords (optional)

Export from 1Password as CSV or XLSX, then choose **Import** in the app. Check the columns it matched, review the preview, and confirm. **Delete the original export file afterwards.** It contains your passwords as plain text.

---

## Backups

You are your own safety net, so make backups.

- Use **Download backup** to save a single `.html` file. It contains your whole vault, scrambled with your master password, plus a small viewer.
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
- **Layout:** `docs/` is the web app (served by GitHub Pages). `extension/` is the browser extension (Manifest V3). `firestore.rules` holds the database rules.
- **Backend:** Firebase Auth (email and password) and Firestore. The app talks to the database through a small separate layer, so another database could be added.
- **Keys:** your master password goes through PBKDF2 to produce a master key, and HKDF splits that into two independent values. One is used as the Firebase password. The other is the encryption key and never leaves the device.
- **Encryption:** each entry is encrypted as a single AES-256-GCM blob using the browser's Web Crypto API. Firestore stores only the ciphertext and a few plain fields (id, schema version, last-updated time).
- **Sync:** last write wins, per entry.
- **Offline:** each client keeps an encrypted local copy of the vault.

This is a personal project. It hasn't had an independent security review, so use it at your own risk and keep backups.

## Design

The full description of what passkeppler is and how it behaves is in [`DESIGN.md`](DESIGN.md).
