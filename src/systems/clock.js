// Pure day-of-week logic for the rare merchant (Tue/Thu/Sun). `override` is the dev-only debug day (0=Sun..6=Sat).
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const MERCHANT_DAYS = [0, 2, 4];

export function currentDay(now = new Date(), override = null) {
  return Number.isInteger(override) && override >= 0 && override <= 6 ? override : now.getDay();
}

export const isMerchantDay = (day) => MERCHANT_DAYS.includes(day);
