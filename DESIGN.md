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

The app contains no Firebase credentials. On first run it asks for the Firebase config, which is pasted into a single box and saved on that device (and editable later in Settings). This means:

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
- Autofill on login pages

Nothing else is planned. If something is missing once it's in use, it gets added then.
