const SEASON_REMINDER_WINDOW_DAYS = 14;

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return year >= 2000 && year <= 2100 && localDateKey(date) === value ? date : null;
}

function defaultSeasonReminderSettings() {
  // Dates are deliberately empty: there is no universal or official season assumed here.
  return { enabled: false, hour: 19, minute: 0, seasonStart: '', seasonEnd: '' };
}

function validateSeasonReminderSettings(value, now = new Date(), allowExpired = false) {
  if (!value || typeof value.enabled !== 'boolean') throw Error('Hatırlatma tercihini kontrol edin.');
  if (!value.enabled) {
    // A malformed old preference must never prevent opting out.
    return { enabled: false,
      hour: Number.isInteger(value.hour) && value.hour >= 0 && value.hour <= 23 ? value.hour : 19,
      minute: Number.isInteger(value.minute) && value.minute >= 0 && value.minute <= 59 ? value.minute : 0,
      seasonStart: parseDate(value.seasonStart) ? value.seasonStart : '',
      seasonEnd: parseDate(value.seasonEnd) ? value.seasonEnd : '',
    };
  }
  if (!Number.isInteger(value.hour) || value.hour < 0 || value.hour > 23
    || !Number.isInteger(value.minute) || value.minute < 0 || value.minute > 59) throw Error('Geçerli bir hatırlatma saati seçin.');
  const start = parseDate(value.seasonStart);
  const end = parseDate(value.seasonEnd);
  if (!start || !end) throw Error('Sezon başlangıç ve bitiş tarihlerini seçin.');
  if (value.seasonEnd < value.seasonStart) throw Error('Sezon bitişi başlangıçtan önce olamaz.');
  const calendarDay = date => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  if ((calendarDay(end) - calendarDay(start)) / 86400000 > 365) throw Error('Bir sezon en fazla 366 gün olabilir.');
  if (!allowExpired && value.seasonEnd < localDateKey(now)) throw Error('Sezon bitmiş. Yeni sezon için tarihleri güncelleyin.');
  return { enabled: value.enabled && value.seasonEnd >= localDateKey(now), hour: value.hour,
    minute: value.minute, seasonStart: value.seasonStart, seasonEnd: value.seasonEnd };
}

function seasonReminderDates(settings, now = new Date()) {
  const valid = validateSeasonReminderSettings(settings, now, true);
  if (!valid.enabled) return [];
  const dates = [];
  // Calendar increments (not 24-hour milliseconds) preserve local time across DST.
  // A short one-off window means prolonged inactivity cannot produce endless nudges.
  for (let day = 0; day < SEASON_REMINDER_WINDOW_DAYS; day++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + day, valid.hour, valid.minute, 0, 0);
    const key = localDateKey(date);
    if (date > now && key >= valid.seasonStart && key <= valid.seasonEnd) dates.push(date);
  }
  return dates;
}

module.exports = { SEASON_REMINDER_WINDOW_DAYS, defaultSeasonReminderSettings, validateSeasonReminderSettings, seasonReminderDates };
