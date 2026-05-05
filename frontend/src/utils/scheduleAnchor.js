export const browserTimezone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone;

export const minuteOfDayToHHMM = (m) => {
  if (m == null) return "";
  const h = String(Math.floor(m / 60)).padStart(2, "0");
  const mm = String(m % 60).padStart(2, "0");
  return `${h}:${mm}`;
};

export const hhmmToMinuteOfDay = (s) => {
  if (!s) return null;
  const [h, m] = s.split(":").map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  return h * 60 + m;
};
