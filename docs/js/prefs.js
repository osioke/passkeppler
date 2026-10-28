// Small settings kept on this device: the backup reminder.

const DAYS_KEY = "passkeppler.backupReminderDays";
const LAST_KEY = "passkeppler.lastBackup";

export const DEFAULT_REMINDER_DAYS = 14;

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* settings just won't be remembered */
  }
}

export function getReminderDays() {
  const days = Math.round(Number(read(DAYS_KEY)));
  return days >= 1 && days <= 365 ? days : DEFAULT_REMINDER_DAYS;
}

export function setReminderDays(days) {
  write(DAYS_KEY, days);
}

export function getLastBackup() {
  const time = Number(read(LAST_KEY));
  return time > 0 ? time : null;
}

export function markBackupDone(time = Date.now()) {
  write(LAST_KEY, time);
}

// What to tell the person about their backups, and whether it's time for a new one.
export function backupStatus(entryCount, now = Date.now()) {
  const last = getLastBackup();
  if (!last) {
    return { text: entryCount ? "You haven't made a backup on this device yet." : "", overdue: entryCount > 0 };
  }
  const days = Math.floor((now - last) / 86400000);
  const when = days <= 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`;
  const overdue = days > getReminderDays();
  return { text: `Last backup: ${when}.` + (overdue ? " Time for a new one." : ""), overdue };
}
