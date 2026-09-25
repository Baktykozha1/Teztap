const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const WEEKDAY_TO_INDEX = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function parseMinutes(value) {
  if (!/^\d{1,2}:\d{2}$/.test(String(value))) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (hour > 24 || minute > 59 || (hour === 24 && minute !== 0)) return null;
  return hour * 60 + minute;
}

function parseDays(value) {
  if (!value) return DAYS.map((_, index) => index);
  const selected = new Set();
  for (const part of value.split(",")) {
    const [startName, endName] = part.trim().split("-");
    const start = DAYS.indexOf(startName);
    const end = endName ? DAYS.indexOf(endName) : start;
    if (start < 0 || end < 0) return null;
    let day = start;
    do { selected.add(day); if (day === end) break; day = (day + 1) % 7; } while (day !== start);
  }
  return [...selected];
}

function parseOpeningHours(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (raw === "24/7") return { alwaysOpen: true, windows: [], closedDays: [] };
  const windows = [];
  const closedDays = new Set();
  for (const fragment of raw.split(";")) {
    const segment = fragment.trim();
    if (!segment) return null;
    const firstTime = segment.search(/\d{1,2}:\d{2}/);
    if (firstTime < 0) {
      const offMatch = segment.match(/^((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:[-,](?:Mo|Tu|We|Th|Fr|Sa|Su))*)\s+off$/);
      if (offMatch) { const days = parseDays(offMatch[1]); if (!days) return null; days.forEach((day) => closedDays.add(day)); continue; }
      return null;
    }
    const days = parseDays(segment.slice(0, firstTime).trim());
    if (!days) return null;
    const timeRanges = segment.slice(firstTime).split(",").map((part) => part.trim());
    for (const range of timeRanges) {
      const match = range.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
      if (!match) return null;
      const start = parseMinutes(match[1]);
      const end = parseMinutes(match[2]);
      if (start == null || end == null) return null;
      windows.push({ days, start, end });
    }
  }
  return windows.length ? { alwaysOpen: false, windows, closedDays: [...closedDays] } : null;
}

function aktauClock(date = new Date()) {
  const values = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Almaty", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));
  return { day: WEEKDAY_TO_INDEX[values.weekday], minute: Number(values.hour) * 60 + Number(values.minute) };
}

function isOpenAt(openingHours, date = new Date(), requestedTime = null) {
  const schedule = parseOpeningHours(openingHours);
  if (!schedule) return null;
  if (schedule.alwaysOpen) return true;
  const clock = aktauClock(date);
  if (schedule.closedDays.includes(clock.day)) return false;
  const minute = requestedTime ? parseMinutes(requestedTime) : clock.minute;
  if (minute == null || minute >= 24 * 60) return null;
  const previousDay = (clock.day + 6) % 7;
  return schedule.windows.some(({ days, start, end }) => end > start
    ? days.includes(clock.day) && minute >= start && minute < end
    : (days.includes(clock.day) && minute >= start) || (days.includes(previousDay) && minute < end));
}

module.exports = { isOpenAt, parseOpeningHours };
