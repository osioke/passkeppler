# passkeppler

> *"A broke man's alternative to password keeping."*

## What it is

passkeppler is a simple personal password keeper, built for one person. It exists so the passwords saved in 1Password can be kept, viewed and edited without paying for a subscription, and so new passwords can be created and stored without memorising them or reusing them.

It is deliberately small. No team features, no sharing, no extras that don't serve the jobs below.

## What it's for

1. **View and edit saved entries**, including the entries exported from 1Password.
2. **Keep track of backup (recovery) codes**: paste a block of codes for an account and cross off each one as it's used.
3. **Add new entries** and **generate strong passwords** (random characters or word phrases).
4. **Never get locked out**: the vault should stay reachable even if a laptop, a browser, or Firebase fails.

## Where it runs

- **Browser extension**: the main way it will be used day to day, since most of the work happens in a browser.
- **Web app**: hosted on GitHub Pages (`osioke.github.io/passkeppler`). Plain HTML, CSS and JavaScript. A separate way in that works on any device with a browser, including a phone, and is the fallback if the computer or the extension fails.

Both are part of the first version and use the same screens. They read and write the same vault, so the latest information is available in both.

## Storage: bring your own Firebase

Entries are stored in the user's own Firebase project (Firestore for the data, Firebase Auth for login), on the free plan.

The project as published contains no Firebase credentials. By default, on first run the app asks for the Firebase config, which is pasted into a single box and saved on that device. The owner can instead put their config in `docs/firebase-config.js`. Every device that opens their page, and every copy of the extension they build, then connects on its own, and the only things to remember are the email and master password. This means:

- Anyone who forks the project can use their own Firebase project without touching anyone else's.
- The config is not a secret. It is an address, not a key.
- The app talks to the database through a small, separate layer, so someone could add another database later.

## Security

- **One master password** unlocks everything. It is the only password to remember.
- **The vault is scrambled on your device** before it is saved, using the encryption built into the browser (no extra software). Firebase only ever stores scrambled data, so even someone looking directly at the database sees nothing readable.
- **If the master password is forgotten, there is no recovery.** Nobody can reset it. It should be written down on paper and kept somewhere safe.

## What's stored for each entry

- Title (the name of what the password is for)
- URL
- Username and/or email (either, or both)
- Password
- Notes
- **Backup codes** (see below)
- **Custom fields**: any extra label/value pairs, such as a recovery key or PIN, with an option to hide the value until revealed
- Created and updated times

## Backup codes

A plain multi-line field on each entry, one code per line.

- Paste a whole block of codes in one go.
- A **Copy** button copies the block back out, one code per line.
- Tap a line to cross it out as used; tap again to undo.
- Each line has a small delete button.
- The field can also be edited as plain text.

Authenticator (OTP) seeds are **not** stored; those stay in Authy.

## Password generator

- **Characters mode**: choose the length, and whether to include special characters and how many.
- **Phrase mode**: choose the number of words.
- Uses secure randomness, and always honours the requested number of special characters.
- A built-in word list is used for phrases, so it works offline.

## Import from 1Password

- Accepts **CSV and XLSX** files (the original export was CSV, then edited and extended in XLSX).
- The app guesses which column is which, and asks for confirmation before importing.
- A preview lets you sort, edit and delete bad rows before anything is saved.
- Once imported and backed up, the original CSV/XLSX files should be deleted, since they are plain text.

## Backups and resilience

- **Local copy on every device.** Each device keeps its own encrypted copy of the vault, so it still opens if Firebase or the internet is unavailable.
- **One-click backup.** Downloads a single `.html` file containing the whole vault (encrypted with the master password) plus a small built-in viewer. It opens by double-clicking in any browser, with no internet, no Firebase and no app needed. Type the master password and read it.
- **Restore.** A backup can be loaded back into the app. If it is older than the current vault, the app warns first.
- **Backup reminder.** The app shows how long ago the last backup was, and warns after 14 days (adjustable in Settings).
- **Which copy is newest.** Backups and the live vault each carry a revision number and timestamp that can be read without unlocking, so copies are easy to compare.
- **Suggested backup places:** the laptop, an external drive or flash drive, and one or two online drives.

## Syncing

Changes sync through Firebase to all devices. If the same entry is edited on two devices, the most recent edit wins.

## What's included

**Both the extension and the web app**
- Master password and bring-your-own Firebase setup
- Import (CSV/XLSX), view, search, add, edit, delete
- Backup codes field and custom fields
- Password generator
- Sync, and a local copy on each device
- One-click `.html` backup, restore, and the backup reminder

**Extension only**
- Copy a username or password from the popup
- Autofill on login pages: press a button on an entry to fill the login form of the open tab. Nothing is filled automatically.
- Stays unlocked until Lock is pressed or the browser closes
- Opens at once from the copy of the vault already on the device, and signs in to Firebase in the background, so opening it never waits for the network. If there is no copy yet (a new device), it signs in first.
- **Notices logins**: when a login form is submitted on a page, the extension remembers the username and password for that tab. A small card then appears on the page itself with **Save this login?** (nothing like it is saved) or **Update the saved password?** (the same site and username is saved with a different password); if it is already saved exactly like this, nothing is shown. Nothing is saved until Save or Update is pressed; **Not now** drops it. If the card can't appear, the icon shows a **!** badge and the popup offers the same thing. See "Noticing logins" below.
- Import and Restore open in a full tab, because choosing a file closes a popup

## Noticing logins

The extension runs a small watcher on every web page and a small background part that keeps what the watcher saw. The background part never reads the vault itself. While you are unlocked, a hidden page of the extension keeps the unlocked vault open in memory (the same data the popup shows) and answers whether a login is new, a changed password, or already saved. That page is created when you unlock and closed when you press Lock, so it exists only while the popup could also open the vault. It saves a login the same way the popup does: encrypted on the device, then to Firebase.

- The card is drawn on the page in its own sealed box, so the page's styles and scripts can't change or press it; only a real click by you counts. It shows the site and the name, never the password.
- The card waits until the login seems to have worked, meaning no visible password box is left on the page, and is offered for about a minute across page changes. If the site sends the login form back (a wrong password), no card is shown and the login waits in the popup.
- While locked, the vault can't be checked, so the card says **Unlock to save this login**. Its Unlock button opens the extension's own popup; the master password is never typed on a web page, because a page's scripts can see what is typed into it. Unlocking turns the card into Save or Update (or removes it if the login is already saved). Closing the browser locks the extension, so the first login after starting the browser usually shows this card.
- The icon also gets a **!** badge, and the popup shows the offer at the top of the list, as a fallback.

- A login is remembered per tab, in the browser's memory only (never written to disk, never visible to web pages). It is thrown away when it is saved, put aside with **Not now**, when **Lock** is pressed, when its tab closes, or when the browser closes.
- A form counts as a **sign-up** when it has two password fields holding the same text (new password and "confirm"), or one password field marked as a new password. The email is the field of type email (or one that looks like an address), and the username is a field named like a username; first name, phone and similar boxes are ignored. A form with two different password fields, or three, is a change-password form and is skipped for now.
- On a sign-up, a login that is already saved exactly like this is not silent: the card says **Already saved** (with OK). On a plain sign-in it stays silent. If the site already has saved logins under another name, the Save card says how many.
- A site matches a saved entry when the entry's website is that site (or the site the page is inside of, so `login.example.com` matches `example.com`) and the username or email is the same as the username or the email typed, ignoring capital letters.
- **Update** changes only the password of that entry. **Save** adds a new entry titled with the site, with the site's address, and each name typed goes in Email if it contains an @ and in Username if not.
- A login counts when the form is submitted, when its submit button is pressed, or when Enter is pressed in the password field, because sites differ in which of these really happens. The same login seen twice within a few seconds is kept once. The watcher starts at the very beginning of every page, and is added to pages already open when the extension is installed or refreshed.
- The popup says whether the open page is being watched. If a login form was skipped (for example it had two password fields, or no username), it says why. The reason is kept in memory only and holds no passwords or names.
- passkeppler's own unlock page is never noticed, so the master password can't be offered for saving.
- The extension runs on all websites, which browsers describe as being able to "read and change your data on all sites". It only reads a form when it is submitted.

It is built one kind of login at a time, easiest first, each solid before the next:

1. **Done:** a normal login page, with the username and password on one page and a real submit.
2. **Done:** sign-up pages (a new-password field, often a confirm field, and an email).
3. Two-step logins (username on one page, password on the next).
4. Sites that don't use a normal form submit (the login is sent in the background, or the page changes without a reload).
5. "Sign in with Google" and similar, where there is no password: offer to save a note that the site uses it.
6. The hardest ones: logins inside frames, and unusual fields. Some will be missed.

Later, the offer is meant to appear as a pop-up on the page itself, one login type at a time. For now it appears when the extension is opened.

Nothing else is planned. If something is missing once it's in use, it gets added then.
