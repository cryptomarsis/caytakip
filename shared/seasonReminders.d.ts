export type DailyReminderSettings = {
  enabled: boolean;
  hour: number;
  minute: number;
  seasonStart: string;
  seasonEnd: string;
};
export const SEASON_REMINDER_WINDOW_DAYS: number;
export function defaultSeasonReminderSettings(): DailyReminderSettings;
export function validateSeasonReminderSettings(value: unknown, now?: Date, allowExpired?: boolean): DailyReminderSettings;
export function seasonReminderDates(settings: DailyReminderSettings, now?: Date): Date[];
