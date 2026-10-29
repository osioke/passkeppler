// Whether the unlock key is kept after the page closes. In the web app it never is:
// closing or reloading the page forgets it, and the master password is asked for again.
// The browser extension swaps this file for one that keeps it until the browser closes.

export const enabled = false;
export async function save() {}
export async function load() {
  return null;
}
export async function clear() {}
