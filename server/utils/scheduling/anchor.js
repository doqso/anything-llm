function currentMinuteOfDayInTz(timezone, now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour").value);
  const m = Number(parts.find((p) => p.type === "minute").value);
  const s = Number(parts.find((p) => p.type === "second").value);
  return h * 60 + m + s / 60;
}

function calcAnchoredNextSync(
  intervalMs,
  startMinuteOfDay,
  timezone,
  now = Date.now()
) {
  if (
    startMinuteOfDay == null ||
    !timezone ||
    !Number.isFinite(intervalMs) ||
    intervalMs <= 0
  ) {
    return new Date(now + intervalMs);
  }
  try {
    const intervalMin = intervalMs / 60000;
    const nowMin = currentMinuteOfDayInTz(timezone, new Date(now));
    const sinceAnchor =
      (((nowMin - startMinuteOfDay) % intervalMin) + intervalMin) % intervalMin;
    let untilNext = intervalMin - sinceAnchor;
    if (untilNext <= 0) untilNext = intervalMin;
    return new Date(now + untilNext * 60000);
  } catch {
    return new Date(now + intervalMs);
  }
}

function isValidTimezone(tz) {
  if (typeof tz !== "string" || !tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  currentMinuteOfDayInTz,
  calcAnchoredNextSync,
  isValidTimezone,
};
